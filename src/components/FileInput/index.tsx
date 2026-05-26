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
// Created     : Tuesday May 26 2026
//
// =============================================================

import type { ChangeEvent } from "react";
import { useId, useState } from "react";

import { cn } from "../../helpers/Cn";

type FileInputProps = {
  label?: string;
  hint?: string;
  accept?: string;
  multiple?: boolean;
  error?: string;
  onFilesChange?: (files: File[]) => void;
};

export function FileInput({
  accept = ".dcm,.nii,.nii.gz,DICOMDIR",
  error,
  hint,
  label,
  multiple = false,
  onFilesChange,
}: FileInputProps) {
  const inputId = useId();
  const descriptionId = `${inputId}-description`;
  const [fileNames, setFileNames] = useState<string[]>([]);
  const hasDescription = Boolean(error || hint);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const names = files.map((file) => file.name);

    setFileNames(names);
    onFilesChange?.(files);
  };

  return (
    <div className="space-y-1.5">
      {label ? (
        <label className="block text-sm font-medium text-contrast-200" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-contrast-600 bg-dark-contrast px-4 py-6 text-center text-contrast-300 transition hover:border-primary hover:text-white",
          error && "border-quaternary hover:border-quaternary",
        )}
        htmlFor={inputId}
      >
        <span className="text-sm font-medium text-contrast-100">
          {fileNames.length > 0 ? "Fichiers selectionnes" : "Selectionner des fichiers CT"}
        </span>
        <span className="mt-1 text-xs text-contrast-500">
          {fileNames.length > 0 ? fileNames.join(", ") : accept}
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
      {hasDescription ? (
        <p
          className={cn("text-xs text-contrast-400", error && "text-quaternary-200")}
          id={descriptionId}
        >
          {error || hint}
        </p>
      ) : null}
    </div>
  );
}
