// src/view/Import/index.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Studies } from "~/api";
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
} from "~/components";
import { FileInput } from "./components";

const acceptedFormats = "";
const supportedFormatsLabel = "DICOM (.dcm ou sans extension), DICOMDIR, .nii, .nii.gz";

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function getImportErrorMessage(error: unknown): string {
  const errorRecord = getRecord(error);
  const responseRecord = getRecord(errorRecord?.response);
  const dataRecord = getRecord(responseRecord?.data);
  const detail = dataRecord?.detail;
  const message = dataRecord?.message;

  if (typeof detail === "string") return detail;
  if (typeof message === "string") return message;
  
  return "Import impossible. Vérifiez l'intégrité des fichiers sélectionnés.";
}

export default function Import() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  const hasFiles = files.length > 0;
  const fileCountLabel = files.length > 1 ? `${files.length} fichiers` : `${files.length} fichier`;

  const handleFilesChange = (nextFiles: File[]) => {
    setFiles(nextFiles);
    setErrorMessage(null);
  };

  const handleImport = async () => {
    if (!hasFiles || isImporting) return;

    setErrorMessage(null);
    setIsImporting(true);

    try {
      const response = await Studies.importStudy(files);
      const studyId = response.data.id;
      navigate(`/studies/${encodeURIComponent(studyId)}/workspace`);
    } catch (error) {
      setErrorMessage(getImportErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4 font-manrope">
      {/* Header global discret */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Badge variant="info" className="bg-primary-900/30 text-primary-300 border border-primary-800/50">IA Clinique</Badge>
          <span className="text-sm font-semibold text-text-soft">Hékia CT Viewer</span>
        </div>
      </div>

      {/* Bloc central */}
      <section className="w-full max-w-xl flex flex-col gap-8">
        
        <header className="text-center space-y-3">
          <h1 className="text-3xl font-extrabold text-text tracking-tight">
            Importer un examen CT
          </h1>
          <p className="text-sm text-text-muted mx-auto max-w-md leading-relaxed">
            Sélectionnez une série DICOM ou un volume NIfTI. Le transfert est sécurisé et traité localement.
          </p>
        </header>

        <div className="rounded-2xl border border-border bg-surface shadow-2xl p-6 sm:p-8 space-y-6">
          <FileInput
            accept={acceptedFormats}
            allowDirectory
            formatsLabel={supportedFormatsLabel}
            hint="Pour un DICOMDIR, sélectionnez le dossier racine qui contient DICOMDIR et les sous-dossiers d'images."
            multiple
            onFilesChange={handleFilesChange}
          />

          {hasFiles && (
            <div className="rounded-xl border border-border-soft bg-surface-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Fichiers en attente
                </span>
                <span className="text-xs font-medium text-primary-400 bg-primary-900/20 px-2 py-1 rounded-md">
                  {fileCountLabel}
                </span>
              </div>
              
              <ul className="max-h-32 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {files.map((file) => (
                  <li 
                    className="truncate text-sm text-text-soft flex items-center gap-2" 
                    key={`${file.name}-${file.lastModified}`}
                  >
                    <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {"webkitRelativePath" in file && file.webkitRelativePath
                      ? file.webkitRelativePath
                      : file.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {errorMessage && (
            <div className="p-4 rounded-xl bg-quaternary-900/20 border border-quaternary-800/50">
              <ErrorState message={errorMessage} title="Erreur d'importation" />
            </div>
          )}

          {isImporting && (
            <div className="py-2">
              <LoadingState label="Transfert et préparation de l'examen..." />
            </div>
          )}

          <Button
            disabled={!hasFiles || isImporting}
            fullWidth
            isLoading={isImporting}
            onClick={handleImport}
            variant="primary"
            className="h-12 text-base font-semibold shadow-primary-custom"
          >
            {isImporting ? "Importation..." : "Démarrer l'analyse"}
          </Button>
        </div>
      </section>
    </main>
  );
}
