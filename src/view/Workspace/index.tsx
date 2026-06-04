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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Ai, Segmentations, Studies, Workspace as WorkspaceApi } from "~/api";
import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
} from "~/components";
import {
  CornerstoneViewer,
  MaskLabelsPanel,
  SegmentationUpload,
  ViewerToolsPanel,
} from "./components";
import type {
  CornerstoneViewerSource,
  HuMeasurementPanelState,
  MaskLabelState,
  MaskOverlayStatus,
  ViewerAction,
  ViewerActionRequest,
  ViewerCrosshairTarget,
  ViewerTool,
} from "./components";
import type { AiRunCreate } from "~/types/Ai";
import type { StudyViewerResponse, StudyVolumeResponse, ViewerDicomSeries } from "~/types/Studies";
import type { StudyWorkspace } from "~/types/Workspace";

const simulationModuleId = "ct_anatomy_segmentation_nnunet";
const preparableInputTypes = new Set(["nifti", "dicom", "dicomdir"]);

function getRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function getErrorMessage(error: unknown): string {
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

  if (error instanceof Error) {
    return error.message;
  }

  return "Une erreur est survenue.";
}

function normalizeViewer(viewer: StudyWorkspace["viewer"]): StudyViewerResponse | null {
  const viewerRecord = getRecord(viewer);
  const hasStudyId = typeof viewerRecord?.study_id === "string";

  if (!viewerRecord || !hasStudyId) {
    return null;
  }

  return viewer as StudyViewerResponse;
}

function toFrontendApiUrl(url: string) {
  if (url.startsWith("http://127.0.0.1:8000") || url.startsWith("http://localhost:8000")) {
    const nextUrl = new URL(url);

    return `${window.location.origin}/api${nextUrl.pathname}${nextUrl.search}`;
  }

  if (url.startsWith("/studies") || url.startsWith("/health") || url.startsWith("/ai")) {
    return `${window.location.origin}/api${url}`;
  }

  if (url.startsWith("/api")) {
    return `${window.location.origin}${url}`;
  }

  return url;
}

function normalizeCornerstoneImageId(imageId: string) {
  if (!imageId.startsWith("wadouri:")) {
    return imageId;
  }

  const rawUrl = imageId.replace("wadouri:", "");
  const normalizedUrl = toFrontendApiUrl(rawUrl);

  return `wadouri:${normalizedUrl}`;
}

function isDicomPixelImage(filename: string, relativePath: string, imageId?: string) {
  const normalizedFilename = filename.toLowerCase();
  const normalizedPath = relativePath.toLowerCase();
  const normalizedImageId = imageId?.toLowerCase() || "";
  const isDicomDirectory =
    normalizedFilename === "dicomdir" ||
    normalizedPath.endsWith("/dicomdir") ||
    normalizedImageId.endsWith("/dicomdir");

  return !isDicomDirectory;
}

function canPrepareVolumeFromWorkspace(workspace: StudyWorkspace) {
  return !workspace.volume.is_prepared && preparableInputTypes.has(workspace.study.input_type);
}

function getEffectiveCanPrepareVolume(workspace: StudyWorkspace) {
  return (
    workspace.available_actions.can_prepare_volume ||
    canPrepareVolumeFromWorkspace(workspace)
  );
}

function getEmptyDicomViewerMessage(viewer: StudyViewerResponse | null) {
  if (viewer?.input_type === "dicomdir") {
    return "Aucune image DICOM exploitable. Un DICOMDIR seul ne contient pas les pixels. Importez les fichiers DICOM associés ou préparez le volume.";
  }

  return "Aucune image DICOM exploitable. Importez une série DICOM avec pixels ou préparez le volume.";
}

function getUnavailableViewerMessage(inputType: string) {
  if (inputType === "dicomdir") {
    return "DICOMDIR détecté. La préparation du volume nécessite les fichiers DICOM associés.";
  }

  return "Préparation automatique en cours si le volume est disponible.";
}

function getDicomPixelImageIds(series: ViewerDicomSeries) {
  return series.images
    .filter((image) => isDicomPixelImage(image.filename, image.relative_path, image.image_id))
    .map((image) => normalizeCornerstoneImageId(image.image_id));
}

function getFallbackDicomSeries(viewer: StudyViewerResponse | null) {
  const series = viewer?.dicom?.series || [];

  return (
    series.find((item) => getDicomPixelImageIds(item).length > 0) ||
    series[0] ||
    null
  );
}

function getCornerstoneSource({
  allowDicomFallback = false,
  viewer,
  volume,
}: {
  viewer: StudyViewerResponse | null;
  volume: StudyVolumeResponse | null;
  allowDicomFallback?: boolean;
}): CornerstoneViewerSource | null {
  if (volume?.volume.url) {
    return {
      type: "nifti",
      url: toFrontendApiUrl(volume.volume.url),
      name: volume.volume.filename,
    };
  }

  if (!allowDicomFallback) {
    return null;
  }

  const dicomSeries = getFallbackDicomSeries(viewer);
  const dicomImageIds = dicomSeries ? getDicomPixelImageIds(dicomSeries) : [];

  if (dicomSeries) {
    return {
      type: "dicom",
      imageIds: dicomImageIds || [],
      emptyMessage: getEmptyDicomViewerMessage(viewer),
    };
  }

  return null;
}

function getMaskLabelColor(labelId: number) {
  const hue = (labelId * 47) % 360;

  return `hsl(${hue}, 78%, 54%)`;
}

function getMaskPanelOverlayStatus(
  status: MaskOverlayStatus,
): "available" | "unavailable" | "loading" {
  if (status === "loading") {
    return "loading";
  }

  if (status === "active" || status === "hidden") {
    return "available";
  }

  return "unavailable";
}

function createMaskLabelStates(workspace: StudyWorkspace | null): MaskLabelState[] {
  const labels = workspace?.segmentations.latest?.metadata.labels || [];

  return labels.map((label) => ({
    centerIjk: label.center_ijk,
    color: getMaskLabelColor(label.label_id),
    isVisible: true,
    labelId: label.label_id,
    name: label.name || `label_${label.label_id}`,
    volumeMm3: label.volume_mm3,
    voxelCount: label.voxel_count,
  }));
}

function getCrosshairTargetFromLabel(
  label: MaskLabelState | undefined,
  volume: StudyVolumeResponse | null,
): ViewerCrosshairTarget | null {
  const centerIjk = label?.centerIjk;
  const shape = volume?.volume.metadata.shape;

  if (!centerIjk || !shape || shape.length < 2) {
    return null;
  }

  const maxX = Math.max(1, (shape[0] || 1) - 1);
  const maxY = Math.max(1, (shape[1] || 1) - 1);

  return {
    x: Math.max(0, Math.min(1, centerIjk[0] / maxX)),
    y: Math.max(0, Math.min(1, centerIjk[1] / maxY)),
  };
}

function WorkspaceHeader({
  onBack,
  onRefresh,
  status,
}: {
  status: string;
  onBack: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="z-10 flex h-14 items-center justify-between border-b border-border bg-surface px-4 shadow-sm">
      <h1 className="text-sm font-semibold tracking-wide text-text">Hekia CT Viewer</h1>

      <div className="flex items-center gap-2">
        <Badge className="border border-border-soft bg-surface-200" variant="muted">
          {status}
        </Badge>
        <Button onClick={onRefresh} size="sm" variant="ghost">
          Actualiser
        </Button>
        <Button onClick={onBack} size="sm" variant="outline">
          Retour import
        </Button>
      </div>
    </header>
  );
}

function LocalPanel({ children, title }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border-soft px-5 py-4 last:border-b-0">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium text-text">{value}</span>
    </div>
  );
}

function MedicalViewerShell({
  actionRequest,
  activeTool,
  allowDicomFallback,
  canPrepareVolume,
  crosshairTarget,
  error,
  isMaskVisible,
  isBusy,
  inputType,
  maskLabels,
  maskOpacity,
  onActiveToolChange,
  onHuMeasurementChange,
  onMaskOverlayStatusChange,
  onPrepareVolume,
  segmentationUrl,
  studyId,
  viewer,
  volume,
}: {
  viewer: StudyViewerResponse | null;
  volume: StudyVolumeResponse | null;
  actionRequest: ViewerActionRequest | null;
  activeTool: ViewerTool;
  allowDicomFallback: boolean;
  canPrepareVolume: boolean;
  crosshairTarget: ViewerCrosshairTarget | null;
  error: string | null;
  isMaskVisible: boolean;
  isBusy: boolean;
  inputType: string;
  maskLabels: MaskLabelState[];
  maskOpacity: number;
  onActiveToolChange: (tool: ViewerTool) => void;
  onHuMeasurementChange: (state: HuMeasurementPanelState) => void;
  onMaskOverlayStatusChange: (status: MaskOverlayStatus) => void;
  onPrepareVolume: () => void;
  segmentationUrl: string | null;
  studyId: string;
}) {
  const cornerstoneSource = useMemo(
    () => getCornerstoneSource({ allowDicomFallback, viewer, volume }),
    [allowDicomFallback, viewer, volume],
  );
  const isReady = Boolean(cornerstoneSource);
  const unavailableMessage = getUnavailableViewerMessage(inputType);

  if (!isReady) {
    const showFailure = Boolean(error) && !isBusy;

    return (
      <div className="flex h-full items-center justify-center bg-viewer">
        <div className="max-w-md px-8 text-center">
          {!showFailure ? (
            <LoadingState label="Préparation du volume médical..." />
          ) : (
            <>
              <h2 className="text-lg font-semibold text-text">
                {inputType === "dicomdir" ? "DICOMDIR détecté" : "Volume non préparé"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                {error || unavailableMessage}
              </p>
            </>
          )}
          {showFailure ? (
            <Button
              className="mt-5"
              disabled={!canPrepareVolume}
              onClick={onPrepareVolume}
              variant="outline"
            >
              Relancer preparation
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <CornerstoneViewer
      actionRequest={actionRequest}
      activeTool={activeTool}
      crosshairTarget={crosshairTarget}
      isMaskVisible={isMaskVisible}
      isReady={isReady}
      maskLabels={maskLabels}
      maskOpacity={maskOpacity}
      onActiveToolChange={onActiveToolChange}
      onHuMeasurementChange={onHuMeasurementChange}
      onMaskOverlayStatusChange={onMaskOverlayStatusChange}
      segmentationUrl={segmentationUrl}
      source={cornerstoneSource}
      studyId={studyId}
    />
  );
}

function WorkspaceSidePanel({
  activeTool,
  huMeasurementState,
  isAiPredicting,
  isBusy,
  isMaskVisible,
  maskLabels,
  maskLabelsMessage,
  maskOverlayStatus,
  maskOpacity,
  onActiveToolChange,
  onCenterMaskLabel,
  onMaskOpacityChange,
  onRunAiPrediction,
  onToggleMaskLabel,
  onToggleMask,
  onUploadSegmentation,
  onViewerAction,
  workspace,
}: {
  workspace: StudyWorkspace;
  activeTool: ViewerTool;
  huMeasurementState: HuMeasurementPanelState;
  isMaskVisible: boolean;
  isAiPredicting: boolean;
  isBusy: boolean;
  maskLabels: MaskLabelState[];
  maskLabelsMessage: string | null;
  maskOverlayStatus: MaskOverlayStatus;
  maskOpacity: number;
  onActiveToolChange: (tool: ViewerTool) => void;
  onCenterMaskLabel: (labelId: number) => void;
  onMaskOpacityChange: (opacity: number) => void;
  onRunAiPrediction: () => void;
  onToggleMaskLabel: (labelId: number) => void;
  onToggleMask: () => void;
  onUploadSegmentation: (file: File, name?: string) => void;
  onViewerAction: (action: ViewerAction) => void;
}) {
  const latestSegmentation = workspace.segmentations.latest;
  const isUploadDisabled = isBusy || !workspace.volume.is_prepared;
  const canRunAi = workspace.available_actions.can_create_ai_run && workspace.volume.is_prepared;
  const hasSegmentation = Boolean(latestSegmentation);
  const isMaskButtonDisabled =
    !hasSegmentation ||
    maskOverlayStatus === "loading" ||
    maskOverlayStatus === "unavailable" ||
    maskOverlayStatus === "idle";
  const maskButtonLabel = (() => {
    if (!hasSegmentation || maskOverlayStatus === "unavailable" || maskOverlayStatus === "idle") {
      return "Overlay indisponible";
    }

    if (maskOverlayStatus === "loading") {
      return "Chargement masque";
    }

    return isMaskVisible && maskOverlayStatus === "active" ? "Masquer masque" : "Afficher masque";
  })();

  return (
    <aside className="flex w-[360px] flex-shrink-0 flex-col overflow-y-auto border-l border-border-soft bg-surface">
      <LocalPanel title="Examen">
        <StatusRow
          label="Volume"
          value={workspace.volume.is_prepared ? "prêt" : "préparation"}
        />
        <StatusRow label="Segmentation" value={hasSegmentation ? "oui" : "non"} />
      </LocalPanel>

      <LocalPanel title="IA">
        <Button
          disabled={!canRunAi || isBusy}
          fullWidth
          isLoading={isAiPredicting}
          onClick={onRunAiPrediction}
          variant="primary"
        >
          {isAiPredicting ? "Prediction en cours..." : "Lancer prediction IA"}
        </Button>
      </LocalPanel>

      <LocalPanel title="Outils">
        <ViewerToolsPanel
          activeTool={activeTool}
          disabled={!workspace.volume.is_prepared}
          huMeasurementState={huMeasurementState}
          onAction={onViewerAction}
          onToolChange={onActiveToolChange}
        />
      </LocalPanel>

      <LocalPanel title="Masque">
        <Button
          disabled={isMaskButtonDisabled}
          fullWidth
          onClick={onToggleMask}
          variant="soft"
        >
          {maskButtonLabel}
        </Button>
        <MaskLabelsPanel
          labels={maskLabels}
          onCenterLabel={onCenterMaskLabel}
          onOpacityChange={onMaskOpacityChange}
          onToggleLabel={onToggleMaskLabel}
          opacity={maskOpacity}
          overlayStatus={getMaskPanelOverlayStatus(maskOverlayStatus)}
        />
        {maskLabelsMessage ? (
          <p className="text-xs leading-relaxed text-text-muted">{maskLabelsMessage}</p>
        ) : null}
        <div className="rounded border border-border-soft bg-surface-100 p-3">
          <SegmentationUpload isBusy={isUploadDisabled} onUpload={onUploadSegmentation} />
          {!workspace.volume.is_prepared ? (
            <p className="mt-3 text-xs text-quaternary-100">
              Preparez le volume avant d'importer un masque.
            </p>
          ) : null}
        </div>
      </LocalPanel>
    </aside>
  );
}

export default function Workspace() {
  const navigate = useNavigate();
  const { studyId } = useParams<{ studyId: string }>();
  const [workspace, setWorkspace] = useState<StudyWorkspace | null>(null);
  const [viewer, setViewer] = useState<StudyViewerResponse | null>(null);
  const [volume, setVolume] = useState<StudyVolumeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isAiPredicting, setIsAiPredicting] = useState(false);
  const [isAutoPreparing, setIsAutoPreparing] = useState(false);
  const [isMaskVisible, setIsMaskVisible] = useState(true);
  const [activeViewerTool, setActiveViewerTool] = useState<ViewerTool>("crosshair");
  const [viewerActionRequest, setViewerActionRequest] = useState<ViewerActionRequest | null>(null);
  const [crosshairTarget, setCrosshairTarget] = useState<ViewerCrosshairTarget | null>(null);
  const [huMeasurementState, setHuMeasurementState] = useState<HuMeasurementPanelState>({
    status: "idle",
  });
  const [maskLabels, setMaskLabels] = useState<MaskLabelState[]>([]);
  const [maskLabelsMessage, setMaskLabelsMessage] = useState<string | null>(null);
  const [maskOverlayStatus, setMaskOverlayStatus] = useState<MaskOverlayStatus>("idle");
  const [maskOpacity, setMaskOpacity] = useState(0.6);
  const [error, setError] = useState<string | null>(null);
  const autoPreparedStudyIdsRef = useRef<Set<string>>(new Set());

  const loadWorkspace = useCallback(
    async (showLoading = false) => {
      if (!studyId) {
        setError("Identifiant d'etude manquant.");
        setIsLoading(false);
        return;
      }

      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const workspaceResponse = await WorkspaceApi.getWorkspace(studyId);
        const nextWorkspace = workspaceResponse.data;
        const nextViewer = normalizeViewer(nextWorkspace.viewer);
        const nextVolume = nextWorkspace.volume.data;

        setWorkspace(nextWorkspace);
        setViewer(nextViewer);
        setVolume(nextVolume);
        setError(null);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
      } finally {
        setIsLoading(false);
      }
    },
    [studyId],
  );

  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    setError(null);

    try {
      await action();
      await loadWorkspace();
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, loadWorkspace]);

  const handlePrepareVolume = () => {
    void runAction(async () => {
      if (!studyId) {
        throw new Error("Identifiant d'etude manquant.");
      }

      await Studies.prepareStudy(studyId);
    });
  };

  const handleRunAiPrediction = () => {
    setIsAiPredicting(true);
    void runAction(async () => {
      if (!studyId || !workspace) {
        throw new Error("Workspace indisponible.");
      }

      const payload: AiRunCreate = {
        module_id: simulationModuleId,
      };
      const runResponse = await Ai.createRun(studyId, payload);
      const run = runResponse.data;

      if (workspace.available_actions.can_execute_ai) {
        await Ai.executeRun(studyId, run.id);
      } else {
        await Ai.simulateRun(studyId, run.id);
      }

      await Ai.publishSegmentation(studyId, run.id);
    }).finally(() => setIsAiPredicting(false));
  };

  const handleUploadSegmentation = (file: File, name?: string) => {
    void runAction(async () => {
      if (!studyId || !workspace) {
        throw new Error("Workspace indisponible.");
      }

      if (!workspace.volume.is_prepared) {
        throw new Error("Preparez le volume avant d'importer un masque.");
      }

      await Segmentations.uploadSegmentation(studyId, file, name);
    });
  };

  const handleToggleMaskLabel = useCallback((labelId: number) => {
    setMaskLabels((currentLabels) =>
      currentLabels.map((label) =>
        label.labelId === labelId
          ? {
              ...label,
              isVisible: !label.isVisible,
            }
          : label,
      ),
    );

    if (maskOverlayStatus === "idle" || maskOverlayStatus === "unavailable") {
      setMaskLabelsMessage("Overlay non encore disponible dans le viewer.");
    } else {
      setMaskLabelsMessage(null);
    }
  }, [maskOverlayStatus]);

  const handleMaskOpacityChange = useCallback((opacity: number) => {
    setMaskOpacity(opacity);

    if (maskOverlayStatus === "idle" || maskOverlayStatus === "unavailable") {
      setMaskLabelsMessage("Overlay non encore disponible dans le viewer.");
    } else {
      setMaskLabelsMessage(null);
    }
  }, [maskOverlayStatus]);

  const handleCenterMaskLabel = useCallback((labelId: number) => {
    const selectedLabel = maskLabels.find((label) => label.labelId === labelId);
    const nextCrosshairTarget = getCrosshairTargetFromLabel(selectedLabel, volume);

    setMaskLabels((currentLabels) =>
      currentLabels.map((label) => ({
        ...label,
        isSelected: label.labelId === labelId,
      })),
    );
    setActiveViewerTool("crosshair");
    setCrosshairTarget(nextCrosshairTarget);
    setMaskLabelsMessage(
      nextCrosshairTarget
        ? "Repère placé sur le centre estimé du label."
        : "Centrage label à brancher.",
    );
  }, [maskLabels, volume]);

  const handleActiveViewerToolChange = useCallback((tool: ViewerTool) => {
    setActiveViewerTool((currentTool) => {
      if (tool === "hu" && currentTool === "hu") {
        setHuMeasurementState({ status: "idle" });
        return "crosshair";
      }

      return tool;
    });
  }, []);

  const handleViewerAction = useCallback((action: ViewerAction) => {
    if (action === "reset") {
      setActiveViewerTool("crosshair");
      setHuMeasurementState({ status: "idle" });
    }

    setViewerActionRequest((currentRequest) => ({
      action,
      id: (currentRequest?.id || 0) + 1,
    }));
  }, []);

  useEffect(() => {
    void loadWorkspace(true);
  }, [loadWorkspace]);

  useEffect(() => {
    setHuMeasurementState({ status: "idle" });
    setCrosshairTarget(null);
  }, [studyId]);

  useEffect(() => {
    const latestSegmentation = workspace?.segmentations.latest;

    if (!latestSegmentation) {
      setMaskOverlayStatus("idle");
      setIsMaskVisible(true);
      setMaskLabels([]);
      setMaskLabelsMessage(null);
      return;
    }

    setIsMaskVisible(true);
    setMaskLabels(createMaskLabelStates(workspace));
    setMaskLabelsMessage(null);
  }, [workspace?.segmentations.latest?.id]);

  useEffect(() => {
    if (!studyId || !workspace) {
      return;
    }

    const canPrepareVolume = getEffectiveCanPrepareVolume(workspace);

    if (import.meta.env.DEV) {
      console.debug("[Workspace auto-prepare]", {
        studyId,
        canPrepare: workspace.available_actions.can_prepare_volume,
        effectiveCanPrepare: canPrepareVolume,
        isBusy,
        alreadyTried: autoPreparedStudyIdsRef.current.has(studyId),
        status: workspace.study.status,
        inputType: workspace.study.input_type,
      });
    }

    if (isBusy) {
      return;
    }

    if (!canPrepareVolume) {
      return;
    }

    if (autoPreparedStudyIdsRef.current.has(studyId)) {
      return;
    }

    autoPreparedStudyIdsRef.current.add(studyId);
    setIsAutoPreparing(true);
    void runAction(async () => {
      await Studies.prepareStudy(studyId);
    }).finally(() => setIsAutoPreparing(false));
  }, [isBusy, runAction, studyId, workspace]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-text">
        <LoadingState label="Initialisation du workspace" />
      </main>
    );
  }

  if (!workspace || !studyId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <ErrorState
          action={
            <Button onClick={() => navigate("/import")} variant="outline">
              Retour import
            </Button>
          }
          message={error || "Workspace introuvable."}
          title="Erreur de chargement"
        />
      </main>
    );
  }

  const segmentationUrl = workspace.segmentations.latest?.file.url
    ? toFrontendApiUrl(workspace.segmentations.latest.file.url)
    : null;
  const canPrepareVolume = getEffectiveCanPrepareVolume(workspace);
  const isWorkspaceBusy = isBusy || isAutoPreparing;
  const allowDicomFallback = !workspace.volume.is_prepared && !canPrepareVolume && !isWorkspaceBusy;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background font-manrope text-text">
      <WorkspaceHeader
        onBack={() => navigate("/import")}
        onRefresh={() => void loadWorkspace(true)}
        status={workspace.study.status}
      />

      {error ? (
        <div className="border-b border-quaternary-700 bg-quaternary-700/20 p-2 text-center text-sm text-quaternary-100">
          {error}
        </div>
      ) : null}

      <main className="flex flex-1 overflow-hidden">
        <section className="min-w-0 flex-1 border-r border-border bg-viewer">
          <MedicalViewerShell
            actionRequest={viewerActionRequest}
            activeTool={activeViewerTool}
            allowDicomFallback={allowDicomFallback}
            canPrepareVolume={canPrepareVolume}
            crosshairTarget={crosshairTarget}
            error={error}
            inputType={workspace.study.input_type}
            isBusy={isWorkspaceBusy}
            isMaskVisible={isMaskVisible}
            maskLabels={maskLabels}
            maskOpacity={maskOpacity}
            onActiveToolChange={handleActiveViewerToolChange}
            onHuMeasurementChange={setHuMeasurementState}
            onMaskOverlayStatusChange={setMaskOverlayStatus}
            onPrepareVolume={handlePrepareVolume}
            segmentationUrl={segmentationUrl}
            studyId={studyId}
            viewer={viewer}
            volume={volume}
          />
        </section>

        <WorkspaceSidePanel
          activeTool={activeViewerTool}
          huMeasurementState={huMeasurementState}
          isAiPredicting={isAiPredicting}
          isBusy={isWorkspaceBusy}
          isMaskVisible={isMaskVisible}
          maskLabels={maskLabels}
          maskLabelsMessage={maskLabelsMessage}
          maskOverlayStatus={maskOverlayStatus}
          maskOpacity={maskOpacity}
          onActiveToolChange={handleActiveViewerToolChange}
          onCenterMaskLabel={handleCenterMaskLabel}
          onMaskOpacityChange={handleMaskOpacityChange}
          onRunAiPrediction={handleRunAiPrediction}
          onToggleMaskLabel={handleToggleMaskLabel}
          onToggleMask={() => setIsMaskVisible((value) => !value)}
          onUploadSegmentation={handleUploadSegmentation}
          onViewerAction={handleViewerAction}
          workspace={workspace}
        />
      </main>
    </div>
  );
}
