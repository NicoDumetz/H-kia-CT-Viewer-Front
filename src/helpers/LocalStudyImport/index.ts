// =============================================================
//
// File        : index.ts
// Project     : H-kia-CT-Viewer-Front
//
// =============================================================

import { Studies } from "~/api";
import type { LocalDicomBuildResult } from "~/helpers/LocalDicom";
import type { StudyImportSessionStatus } from "~/types/Studies";

export type LocalImportBackendState =
  | "LOCAL_ONLY"
  | "UPLOADING"
  | "BACKEND_PROCESSING"
  | "BACKEND_READY"
  | "AI_RUNNING"
  | "SEGMENTATION_READY"
  | "FAILED";

export type LocalStudyImport = {
  id: string;
  files: File[];
  createdAt: string;
  localDicom: LocalDicomBuildResult;
  backendImportId: string | null;
  backendStudyId: string | null;
  backendStatus: string | null;
  status: LocalImportBackendState;
  uploadProgress: number;
  ctNiftiReady: boolean;
  aiReady: boolean;
  error: string | null;
  metrics: LocalDicomBuildResult["metrics"] & {
    uploadDurationMs?: number;
    timeToAiReadyMs?: number;
  };
};

const localImports = new Map<string, LocalStudyImport>();
const runningBackendImports = new Set<string>();
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function createLocalStudyId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `local-${crypto.randomUUID()}`;
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function getBackendStudyId(data: unknown) {
  const dataRecord = getRecord(data);

  if (typeof dataRecord?.study_id === "string") {
    return dataRecord.study_id;
  }

  if (typeof dataRecord?.id === "string") {
    return dataRecord.id;
  }

  return null;
}

function getErrorMessage(error: unknown) {
  const errorRecord = getRecord(error);
  const responseRecord = getRecord(errorRecord?.response);
  const dataRecord = getRecord(responseRecord?.data);

  if (typeof dataRecord?.detail === "string") {
    return dataRecord.detail;
  }

  if (typeof dataRecord?.message === "string") {
    return dataRecord.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Import backend impossible.";
}

function shouldUseImportSessions() {
  return import.meta.env.VITE_USE_IMPORT_SESSIONS === "true";
}

function patchLocalImport(id: string, patch: Partial<LocalStudyImport>) {
  const currentImport = localImports.get(id);

  if (!currentImport) {
    return null;
  }

  const nextImport = {
    ...currentImport,
    ...patch,
  };

  localImports.set(id, nextImport);
  emitChange();

  return nextImport;
}

function applyBackendStatus(
  localStudyId: string,
  backendStatus: StudyImportSessionStatus,
  startedAt: number,
) {
  const status = backendStatus.status;
  const studyId = backendStatus.study_id || null;
  const isReady = status === "ready" || Boolean(backendStatus.ct_nifti_ready && backendStatus.ai_ready);

  if (status === "failed") {
    patchLocalImport(localStudyId, {
      backendStatus: status,
      error: backendStatus.error || backendStatus.message || "DICOM to NIfTI conversion failed",
      status: "FAILED",
    });
    return;
  }

  patchLocalImport(localStudyId, {
    aiReady: Boolean(backendStatus.ai_ready),
    backendStudyId: studyId || localImports.get(localStudyId)?.backendStudyId || null,
    backendStatus: status,
    ctNiftiReady: Boolean(backendStatus.ct_nifti_ready),
    metrics: {
      ...localImports.get(localStudyId)?.metrics,
      timeToAiReadyMs: isReady ? Math.round(performance.now() - startedAt) : undefined,
    } as LocalStudyImport["metrics"],
    status: isReady ? "BACKEND_READY" : "BACKEND_PROCESSING",
    uploadProgress: 100,
  });
}

async function pollImportSession(localStudyId: string, importId: string, startedAt: number) {
  const pollStartedAt = Date.now();
  const timeoutMs = 30 * 60 * 1000;

  while (Date.now() - pollStartedAt <= timeoutMs) {
    const statusResponse = await Studies.getImportSessionStatus(importId);

    applyBackendStatus(localStudyId, statusResponse.data, startedAt);

    const currentImport = localImports.get(localStudyId);

    if (!currentImport || currentImport.status === "BACKEND_READY" || currentImport.status === "FAILED") {
      return;
    }

    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }

  patchLocalImport(localStudyId, {
    error: "Conversion IA trop longue. Le backend continue peut-etre en arriere-plan.",
  });
}

async function uploadWithImportSession(localStudyId: string, startedAt: number) {
  const createdSession = await Studies.createImportSession();
  const importId = createdSession.data.import_id;
  const currentImport = localImports.get(localStudyId);

  if (!currentImport) {
    return;
  }

  patchLocalImport(localStudyId, {
    backendImportId: importId,
    backendStatus: createdSession.data.status,
    status: "UPLOADING",
  });

  const uploadResponse = await Studies.uploadImportSessionFiles(
    importId,
    currentImport.files,
    (progress) => {
      patchLocalImport(localStudyId, {
        status: "UPLOADING",
        uploadProgress: Math.max(1, Math.min(99, progress)),
      });
    },
  );

  applyBackendStatus(localStudyId, uploadResponse.data, startedAt);
  patchLocalImport(localStudyId, {
    metrics: {
      ...localImports.get(localStudyId)?.metrics,
      uploadDurationMs: Math.round(performance.now() - startedAt),
    } as LocalStudyImport["metrics"],
    status: "BACKEND_PROCESSING",
    uploadProgress: 100,
  });

  const completedResponse = await Studies.completeImportSession(importId);

  applyBackendStatus(localStudyId, completedResponse.data, startedAt);

  const nextImport = localImports.get(localStudyId);

  if (nextImport?.status !== "BACKEND_READY" && nextImport?.status !== "FAILED") {
    await pollImportSession(localStudyId, importId, startedAt);
  }
}

async function uploadWithLegacyEndpoint(localStudyId: string, startedAt: number) {
  const currentImport = localImports.get(localStudyId);

  if (!currentImport) {
    return;
  }

  const response = await Studies.uploadDicom(currentImport.files);
  const studyId = getBackendStudyId(response.data);

  if (!studyId) {
    throw new Error("Réponse backend invalide: identifiant d'étude manquant.");
  }

  patchLocalImport(localStudyId, {
    aiReady: true,
    backendStatus: "ready",
    backendStudyId: studyId,
    ctNiftiReady: true,
    metrics: {
      ...currentImport.metrics,
      timeToAiReadyMs: Math.round(performance.now() - startedAt),
      uploadDurationMs: Math.round(performance.now() - startedAt),
    },
    status: "BACKEND_READY",
    uploadProgress: 100,
  });
}

export function createLocalStudyImport(files: File[], localDicom: LocalDicomBuildResult) {
  const id = createLocalStudyId();
  const nextImport: LocalStudyImport = {
    aiReady: false,
    backendImportId: null,
    backendStatus: null,
    backendStudyId: null,
    createdAt: new Date().toISOString(),
    ctNiftiReady: false,
    error: null,
    files,
    id,
    localDicom,
    metrics: localDicom.metrics,
    status: "LOCAL_ONLY",
    uploadProgress: 0,
  };

  localImports.set(id, nextImport);
  emitChange();

  return nextImport;
}

export function getLocalStudyImport(id: string | undefined | null) {
  if (!id) {
    return null;
  }

  return localImports.get(id) || null;
}

export function subscribeLocalStudyImports(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function startLocalStudyBackendImport(localStudyId: string) {
  if (runningBackendImports.has(localStudyId)) {
    return;
  }

  const currentImport = localImports.get(localStudyId);

  if (!currentImport) {
    return;
  }

  runningBackendImports.add(localStudyId);
  const startedAt = performance.now();

  patchLocalImport(localStudyId, {
    error: null,
    status: "UPLOADING",
    uploadProgress: Math.max(1, currentImport.uploadProgress),
  });

  const uploadPromise = shouldUseImportSessions()
    ? uploadWithImportSession(localStudyId, startedAt)
    : uploadWithLegacyEndpoint(localStudyId, startedAt);

  void uploadPromise
    .catch(async (error) => {
      if (!shouldUseImportSessions()) {
        throw error;
      }

      patchLocalImport(localStudyId, {
        backendStatus: "uploading",
        status: "UPLOADING",
        uploadProgress: Math.max(1, localImports.get(localStudyId)?.uploadProgress || 1),
      });
      await uploadWithLegacyEndpoint(localStudyId, startedAt);
    })
    .catch((error) => {
      patchLocalImport(localStudyId, {
        error: getErrorMessage(error),
        status: "FAILED",
      });
    })
    .finally(() => {
      runningBackendImports.delete(localStudyId);
    });
}
