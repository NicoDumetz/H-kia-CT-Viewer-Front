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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Ai, Segmentations, Studies, Workspace as WorkspaceApi } from "~/api";
import {
  Button,
  ErrorState,
  LoadingState,
} from "~/components";
import {
  CornerstoneViewer,
  LeftStudyPanel,
  RightSegmentationPanel,
  TopToolBar,
  ViewerShell,
} from "./components";
import type {
  CornerstoneViewerSource,
  HuMeasurementPanelState,
  MaskLabelState,
  MaskOverlayStatus,
  ViewerAction,
  ViewerActionRequest,
  ViewerCrosshairTarget,
  ViewerLayoutMode,
  ViewerTool,
  WindowPresetId,
} from "./components";
import type { AiRunCreate } from "~/types/Ai";
import type {
  Study,
  StudyViewerResponse,
  StudyVolumeResponse,
  ViewerDicomSeries,
} from "~/types/Studies";
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
      metadata: volume.volume.metadata,
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

function createMaskLabelStates(workspace: StudyWorkspace | null): MaskLabelState[] {
  const labels = workspace?.segmentations.latest?.metadata.labels || [];

  return labels
    .map((label) => {
      const labelRecord = label as typeof label & {
        center_world?: number[] | null;
      };
      const labelId = label.id || label.label_id;
      const isPresent = label.present !== false;

      return {
        bboxIjk: label.bbox_ijk,
        centerIjk: label.center_ijk,
        centerWorld: labelRecord.center_world,
        color: label.color || `hsl(${(labelId * 47) % 360}, 78%, 54%)`,
        group: label.group || "other",
        isPresent,
        isVisible: isPresent,
        labelId,
        name: label.name || `label_${labelId}`,
        volumeMm3: label.volume_mm3,
        voxelCount: label.voxel_count,
      };
    })
    .sort((left, right) => {
      if (left.isPresent !== right.isPresent) {
        return left.isPresent ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
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
    sliceIndices: {
      axial: centerIjk[2],
      coronal: centerIjk[1],
      sagittal: centerIjk[0],
    },
    x: Math.max(0, Math.min(1, centerIjk[0] / maxX)),
    y: Math.max(0, Math.min(1, centerIjk[1] / maxY)),
  };
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
  onViewerModeChange,
  onWindowPresetChange,
  segmentationUrl,
  studyId,
  viewer,
  viewerMode,
  volume,
  windowPreset,
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
  viewerMode: ViewerLayoutMode;
  windowPreset: WindowPresetId;
  onViewerModeChange: (mode: ViewerLayoutMode) => void;
  onWindowPresetChange: (preset: WindowPresetId) => void;
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
      onViewerModeChange={onViewerModeChange}
      onWindowPresetChange={onWindowPresetChange}
      segmentationUrl={segmentationUrl}
      showControls={false}
      source={cornerstoneSource}
      studyId={studyId}
      viewerMode={viewerMode}
      windowPreset={windowPreset}
    />
  );
}

export default function Workspace() {
  const navigate = useNavigate();
  const { studyId } = useParams<{ studyId: string }>();
  const [workspace, setWorkspace] = useState<StudyWorkspace | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [viewer, setViewer] = useState<StudyViewerResponse | null>(null);
  const [volume, setVolume] = useState<StudyVolumeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isAiPredicting, setIsAiPredicting] = useState(false);
  const [isAutoPreparing, setIsAutoPreparing] = useState(false);
  const [isMaskVisible, setIsMaskVisible] = useState(true);
  const [activeViewerTool, setActiveViewerTool] = useState<ViewerTool>("crosshair");
  const [viewerMode, setViewerMode] = useState<ViewerLayoutMode>("mpr");
  const [windowPreset, setWindowPreset] = useState<WindowPresetId>("soft");
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
        const [workspaceResponse, studiesResponse] = await Promise.all([
          WorkspaceApi.getWorkspace(studyId),
          Studies.getStudies(),
        ]);
        const nextWorkspace = workspaceResponse.data;
        const nextViewer = normalizeViewer(nextWorkspace.viewer);
        const nextVolume = nextWorkspace.volume.data;

        setWorkspace(nextWorkspace);
        setStudies(studiesResponse.data.items);
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

  const handleUploadSegmentation = (file: File, name?: string, labelsFile?: File) => {
    void runAction(async () => {
      if (!studyId || !workspace) {
        throw new Error("Workspace indisponible.");
      }

      if (!workspace.volume.is_prepared) {
        throw new Error("Preparez le volume avant d'importer un masque.");
      }

      await Segmentations.uploadManualSegmentation(studyId, file, {
        labelsFile,
        name,
      });
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

  const handleSetAllLabelsVisible = useCallback((visible: boolean) => {
    setMaskLabels((currentLabels) =>
      currentLabels.map((label) => ({
        ...label,
        isVisible: label.isPresent ? visible : false,
      })),
    );
    setMaskLabelsMessage(null);
  }, []);

  const handleSetGroupVisible = useCallback((group: string, visible: boolean) => {
    setMaskLabels((currentLabels) =>
      currentLabels.map((label) =>
        label.group === group
          ? {
              ...label,
              isVisible: label.isPresent ? visible : false,
            }
          : label,
      ),
    );
    setMaskLabelsMessage(null);
  }, []);

  const handleShowOnlyGroup = useCallback((group: string) => {
    const visibleGroups = group === "vertebrae" ? new Set(["vertebrae", "sacrum"]) : new Set([group]);

    setMaskLabels((currentLabels) =>
      currentLabels.map((label) => ({
        ...label,
        isVisible: label.isPresent && visibleGroups.has(label.group),
      })),
    );
    setMaskLabelsMessage(
      group === "vertebrae" ? "Labels vertébraux et sacrum visibles." : null,
    );
  }, []);

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

    if (!selectedLabel?.isPresent) {
      setMaskLabelsMessage("Label absent dans cette segmentation.");
      return;
    }

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
        ? "Vue déplacée sur le centre estimé du label."
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
    setViewerMode("mpr");
    setWindowPreset("soft");
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
  const nnunetModule = workspace.ai.modules.find((module) => module.id === simulationModuleId);
  const canRunAi =
    workspace.available_actions.can_create_ai_run &&
    workspace.volume.is_prepared &&
    Boolean(nnunetModule?.is_available);
  const aiUnavailableMessage = nnunetModule?.availability_error || null;

  return (
    <ViewerShell
      center={
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
          onViewerModeChange={setViewerMode}
          onWindowPresetChange={setWindowPreset}
          segmentationUrl={segmentationUrl}
          studyId={studyId}
          viewer={viewer}
          viewerMode={viewerMode}
          volume={volume}
          windowPreset={windowPreset}
        />
      }
      error={error}
      leftPanel={
        <LeftStudyPanel
          currentStudyId={studyId}
          onOpenStudy={(nextStudyId) =>
            navigate(`/studies/${encodeURIComponent(nextStudyId)}/workspace`)
          }
          studies={studies}
          viewer={viewer}
          volume={volume}
          workspace={workspace}
        />
      }
      rightPanel={
        <RightSegmentationPanel
          activeTool={activeViewerTool}
          aiUnavailableMessage={aiUnavailableMessage}
          canRunAi={canRunAi}
          huMeasurementState={huMeasurementState}
          isAiPredicting={isAiPredicting}
          isBusy={isWorkspaceBusy}
          isMaskVisible={isMaskVisible}
          maskLabels={maskLabels}
          maskLabelsMessage={maskLabelsMessage}
          maskOverlayStatus={maskOverlayStatus}
          maskOpacity={maskOpacity}
          onCenterMaskLabel={handleCenterMaskLabel}
          onMaskOpacityChange={handleMaskOpacityChange}
          onRunAiPrediction={handleRunAiPrediction}
          onSetAllLabelsVisible={handleSetAllLabelsVisible}
          onSetGroupVisible={handleSetGroupVisible}
          onShowOnlyGroup={handleShowOnlyGroup}
          onToggleMask={() => setIsMaskVisible((value) => !value)}
          onToggleMaskLabel={handleToggleMaskLabel}
          onUploadSegmentation={handleUploadSegmentation}
          workspace={workspace}
        />
      }
      toolbar={
        <TopToolBar
          activeTool={activeViewerTool}
          canRunAi={canRunAi}
          isAiPredicting={isAiPredicting}
          isBusy={isWorkspaceBusy}
          onBack={() => navigate("/import")}
          onImport={() => navigate("/import")}
          onRefresh={() => void loadWorkspace(true)}
          onRunAiPrediction={handleRunAiPrediction}
          onToolChange={handleActiveViewerToolChange}
          onViewerAction={handleViewerAction}
          onViewerModeChange={setViewerMode}
          onWindowPresetChange={setWindowPreset}
          status={workspace.study.status}
          viewerMode={viewerMode}
          windowPreset={windowPreset}
        />
      }
    />
  );
}
