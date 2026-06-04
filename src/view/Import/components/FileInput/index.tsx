// =============================================================
//
// ██╗  ██╗███████╗██╗  ██╗██╗ █████╗
// ██║  ██║██╔════╝██║ ██╔╝██║██╔══██╗
// ███████║█████╗  █████╔╝ ██║███████║
// ██╔══██║██╔══╝  ██╔═██╗ ██║██╔══██║
// ██║  ██║███████╗██║  ██╗██║██║  ██║
// ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
//
// File        : index.tsx
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import type { ChangeEvent, DragEvent, InputHTMLAttributes } from "react";
import { useId, useState } from "react";

import { cn } from "../../../../helpers/Cn";

type FileInputProps = {
  label?: string;
  hint?: string;
  accept?: string;
  formatsLabel?: string;
  multiple?: boolean;
  allowDirectory?: boolean;
  error?: string;
  onFilesChange?: (files: File[]) => void;
};

type FileWithRelativePath = File & {
  webkitRelativePath?: string;
};

function getFileDisplayName(file: File) {
  const fileWithRelativePath = file as FileWithRelativePath;

  return fileWithRelativePath.webkitRelativePath || file.name;
}

export function FileInput({
  accept = ".dcm,.nii,.nii.gz,DICOMDIR",
  allowDirectory = false,
  error,
  formatsLabel,
  hint,
  label,
  multiple = false,
  onFilesChange,
}: FileInputProps) {
  const inputId = useId();
  const directoryInputId = `${inputId}-directory`;
  const descriptionId = `${inputId}-description`;
  const directoryInputAttributes = {
    directory: "",
    webkitdirectory: "",
  } as InputHTMLAttributes<HTMLInputElement>;
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const hasDescription = Boolean(error || hint);
  const supportedFormatsLabel = formatsLabel || accept.split(",").filter(Boolean).join(", ");

  const handleFiles = (files: File[]) => {
    const names = files.map((file) => getFileDisplayName(file));
    setFileNames(names);
    onFilesChange?.(files);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(event.target.files || []));
  };

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      handleFiles(Array.from(event.dataTransfer.files));
    }
  };

  return (
    <div className="space-y-2">
      {label ? (
        <label className="block text-sm font-medium text-text-soft" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200",
          isDragging 
            ? "border-primary-400 bg-surface-200/50 text-text" 
            : "border-border-soft bg-surface-100 hover:border-primary-500 hover:bg-surface-200",
          error && "border-error hover:border-error",
        )}
        htmlFor={inputId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mb-3 rounded-full bg-surface-200 p-3 text-primary-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        
        <span className="text-sm font-semibold text-text">
          {fileNames.length > 0 ? "Fichiers sélectionnés" : "Cliquez ou glissez vos fichiers ici"}
        </span>
        <span className="mt-2 text-xs text-text-muted max-w-xs">
          {fileNames.length > 0 ? `${fileNames.length} fichier(s) prêt(s)` : supportedFormatsLabel}
        </span>
      </label>

      <input
        accept={accept}
        aria-describedby={hasDescription ? descriptionId : undefined}
        className="hidden"
        id={inputId}
        multiple={multiple}
        onChange={handleChange}
        type="file"
      />

      {allowDirectory ? (
        <>
          <label
            className="flex cursor-pointer items-center justify-center rounded-lg border border-border-soft bg-surface-100 px-4 py-2 text-sm font-medium text-text-soft transition hover:border-primary-500 hover:bg-surface-200 hover:text-text"
            htmlFor={directoryInputId}
          >
            Sélectionner un dossier DICOM / DICOMDIR
          </label>

          <input
            {...directoryInputAttributes}
            aria-describedby={hasDescription ? descriptionId : undefined}
            className="hidden"
            id={directoryInputId}
            multiple
            onChange={handleChange}
            type="file"
          />
        </>
      ) : null}
      
      {hasDescription ? (
        <p
          className={cn("text-xs text-text-muted mt-2", error && "text-error")}
          id={descriptionId}
        >
          {error || hint}
        </p>
      ) : null}
    </div>
  );
}
