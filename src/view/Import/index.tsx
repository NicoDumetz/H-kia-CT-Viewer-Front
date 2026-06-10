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

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Studies } from "~/api";
import { Badge } from "~/components";
import { buildLocalDicomStudy } from "~/helpers/LocalDicom";
import { createLocalStudyImport } from "~/helpers/LocalStudyImport";
import { ImportPanel } from "./components";

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function getImportErrorMessage(error: unknown): string {
  const errorRecord = getRecord(error);
  const responseRecord = getRecord(errorRecord?.response);
  const dataRecord = getRecord(responseRecord?.data);
  const detail = dataRecord?.detail;
  const message = dataRecord?.message;

  if (typeof detail === "string") {
    return detail;
  }

  if (typeof message === "string") {
    return message;
  }

  return "Import impossible. Vérifiez l'intégrité des fichiers sélectionnés.";
}

function getStudyIdFromUploadResponse(data: unknown): string | null {
  const dataRecord = getRecord(data);

  if (typeof dataRecord?.study_id === "string") {
    return dataRecord.study_id;
  }

  if (typeof dataRecord?.id === "string") {
    return dataRecord.id;
  }

  return null;
}

function isNiftiFile(file: File) {
  const filename = file.name.toLowerCase();

  return filename.endsWith(".nii") || filename.endsWith(".nii.gz");
}

function isZipFile(file: File) {
  return file.name.toLowerCase().endsWith(".zip");
}

function shouldUseBackendFirstImport(files: File[]) {
  return files.length === 1 && (isNiftiFile(files[0]) || isZipFile(files[0]));
}

export default function Import() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const hasFiles = files.length > 0;

  const handleFilesChange = (nextFiles: File[]) => {
    setFiles(nextFiles);
    setErrorMessage(null);
  };

  const handleImport = async () => {
    if (!hasFiles || isImporting) {
      return;
    }

    setErrorMessage(null);
    setIsImporting(true);

    try {
      if (!shouldUseBackendFirstImport(files)) {
        const localDicom = await buildLocalDicomStudy(files);
        const localStudy = createLocalStudyImport(files, localDicom);

        navigate(`/studies/${encodeURIComponent(localStudy.id)}/workspace`);
        return;
      }

      const response = await Studies.uploadStudy(files);
      const studyId = getStudyIdFromUploadResponse(response.data);

      if (!studyId) {
        throw new Error("Réponse backend invalide: identifiant d'étude manquant.");
      }

      navigate(`/studies/${encodeURIComponent(studyId)}/workspace`);
    } catch (error) {
      setErrorMessage(getImportErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main className="flex min-h-screen w-full flex-col bg-background font-manrope text-text">
      <header className="flex h-12 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">Hekia CT Viewer</span>
          <Badge className="border border-primary-800/50 bg-primary-900/30 text-primary-300" variant="info">
            Import
          </Badge>
        </div>
        <span className="text-xs text-text-muted">DICOM local-first</span>
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,44rem)_minmax(18rem,1fr)]">
        <ImportPanel
          errorMessage={errorMessage}
          files={files}
          isImporting={isImporting}
          onFilesChange={handleFilesChange}
          onImport={handleImport}
        />

        <div className="hidden min-h-0 flex-col gap-3 overflow-hidden rounded border border-border bg-surface p-4 lg:flex">
          <div className="rounded border border-border-soft bg-surface-100 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Flux cible
            </p>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-text-soft">
              <p>1. Lecture locale des fichiers DICOM dans le navigateur.</p>
              <p>2. Ouverture immédiate du viewer sur la stack locale triée.</p>
              <p>3. Upload backend en arrière-plan pour générer ct.nii.gz.</p>
              <p>4. Activation IA quand la study backend est prête.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded border border-border-soft bg-black/20 p-3">
              <p className="font-semibold text-text">Importer un masque</p>
              <p className="mt-1 leading-relaxed text-text-muted">
                Disponible dans le panel segmentation après ouverture du viewer.
              </p>
            </div>
            <div className="rounded border border-border-soft bg-black/20 p-3">
              <p className="font-semibold text-text">Lancer l'IA</p>
              <p className="mt-1 leading-relaxed text-text-muted">
                Disponible dès que le volume est préparé et le module nnU-Net présent.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
