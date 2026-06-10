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

import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import DriveFolderUploadRoundedIcon from "@mui/icons-material/DriveFolderUploadRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import FolderZipRoundedIcon from "@mui/icons-material/FolderZipRounded";

import { Button, ErrorState, LoadingState } from "~/components";
import { cn } from "~/helpers/Cn";
import { FileInput } from "../FileInput";

type ImportMode = "nifti" | "dicom" | "dicomdir" | "zip";

type ImportPanelProps = {
  errorMessage: string | null;
  files: File[];
  isImporting: boolean;
  onFilesChange: (files: File[]) => void;
  onImport: () => void;
};

const importModes = [
  {
    id: "nifti",
    title: "NIfTI",
    description: ".nii ou .nii.gz",
    icon: <DescriptionRoundedIcon fontSize="small" />,
  },
  {
    id: "dicom",
    title: "DICOM folder",
    description: "Série ou dossier",
    icon: <DriveFolderUploadRoundedIcon fontSize="small" />,
  },
  {
    id: "dicomdir",
    title: "DICOMDIR",
    description: "Dossier racine complet",
    icon: <FolderOpenRoundedIcon fontSize="small" />,
  },
  {
    id: "zip",
    title: "ZIP DICOM",
    description: "Si support backend",
    icon: <FolderZipRoundedIcon fontSize="small" />,
  },
] satisfies Array<{
  id: ImportMode;
  title: string;
  description: string;
  icon: ReactNode;
}>;

type FileWithRelativePath = File & {
  webkitRelativePath?: string;
};

function getFileDisplayName(file: File) {
  const fileWithRelativePath = file as FileWithRelativePath;

  return fileWithRelativePath.webkitRelativePath || file.name;
}

function getHint(mode: ImportMode) {
  if (mode === "dicomdir") {
    return "Sélectionnez le dossier racine qui contient DICOMDIR et les fichiers pixels associés.";
  }

  if (mode === "zip") {
    return "Le zip est envoyé au backend comme import DICOM si le endpoint le supporte.";
  }

  if (mode === "nifti") {
    return "Le NIfTI est importé directement côté backend.";
  }

  return "Sélectionnez le dossier ou les fichiers DICOM. Le viewer s'ouvrira depuis les fichiers locaux.";
}

function getAccept(mode: ImportMode) {
  if (mode === "nifti") {
    return ".nii,.nii.gz";
  }

  if (mode === "zip") {
    return ".zip";
  }

  return "";
}

export function ImportPanel({
  errorMessage,
  files,
  isImporting,
  onFilesChange,
  onImport,
}: ImportPanelProps) {
  const [mode, setMode] = useState<ImportMode>("dicom");
  const hasFiles = files.length > 0;
  const fileCountLabel = files.length > 1 ? `${files.length} fichiers` : `${files.length} fichier`;
  const fileNames = useMemo(() => files.slice(0, 80).map(getFileDisplayName), [files]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-border bg-surface shadow-2xl">
      <div className="border-b border-border-soft px-4 py-3">
        <h1 className="text-base font-extrabold text-text">Importer un examen</h1>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Les DICOM locaux s'affichent immédiatement, l'IA arrive après préparation backend.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 border-b border-border-soft p-3 sm:grid-cols-4">
        {importModes.map((item) => (
          <button
            className={cn(
              "flex min-h-16 flex-col items-start justify-between rounded border p-2 text-left transition",
              mode === item.id
                ? "border-primary/70 bg-primary/15 text-text"
                : "border-border-soft bg-surface-100 text-text-soft hover:border-primary/50",
            )}
            key={item.id}
            onClick={() => setMode(item.id)}
            type="button"
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              {item.icon}
              {item.title}
            </span>
            <span className="text-[11px] text-text-muted">{item.description}</span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <FileInput
          accept={getAccept(mode)}
          allowDirectory={mode === "dicom" || mode === "dicomdir"}
          formatsLabel="DICOM, DICOMDIR, .nii, .nii.gz, .zip"
          hint={getHint(mode)}
          multiple
          onFilesChange={onFilesChange}
        />

        {hasFiles ? (
          <div className="mt-4 rounded border border-border-soft bg-surface-100 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Fichiers en attente
              </span>
              <span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary-200">
                {fileCountLabel}
              </span>
            </div>

            <ul className="max-h-36 space-y-1 overflow-y-auto pr-1">
              {fileNames.map((name) => (
                <li className="truncate text-xs text-text-soft" key={name}>
                  {name}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded border border-quaternary-800/50 bg-quaternary-900/20 p-3">
            <ErrorState message={errorMessage} title="Erreur d'importation" />
          </div>
        ) : null}

        {isImporting ? (
          <div className="mt-4">
            <LoadingState label="Lecture locale de l'examen..." />
          </div>
        ) : null}
      </div>

      <div className="border-t border-border-soft p-3">
        <Button
          className="h-10 rounded text-sm font-semibold"
          disabled={!hasFiles || isImporting}
          fullWidth
          isLoading={isImporting}
          onClick={onImport}
          variant="primary"
        >
          {isImporting ? "Lecture..." : "Ouvrir le viewer"}
        </Button>
      </div>
    </section>
  );
}
