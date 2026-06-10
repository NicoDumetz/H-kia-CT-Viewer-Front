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
import type { LocalStudyImport } from "~/helpers/LocalStudyImport";
import {
  getLocalStudyImport,
  startLocalStudyBackendImport,
  subscribeLocalStudyImports,
} from "~/helpers/LocalStudyImport";
import type {
  CornerstoneViewerSource,
  MaskLabelState,
  MaskOverlayStatus,
  ViewerAction,
  ViewerActionRequest,
  ViewerCrosshairTarget,
  ViewerLayoutMode,
  ViewerTool,
  WindowPresetId,
} from "./components";
import { getMeasurementPrimaryPoint } from "./measurements/measurementGeometry";
import type { MedicalMeasurement } from "./measurements/measurementTypes";
import { useMeasurements } from "./measurements/useMeasurements";
import type { AiRun, AiRunCreate } from "~/types/Ai";
import type {
  Study,
  StudyViewerResponse,
  StudyVolumeResponse,
  ViewerDicomSeries,
} from "~/types/Studies";
import type { StudyWorkspace } from "~/types/Workspace";

const simulationModuleId = "ct_anatomy_segmentation_nnunet";
const aiPollIntervalMs = 3000;
const aiPollTimeoutMs = 30 * 60 * 1000;
const preparableInputTypes = new Set(["nifti", "dicom", "dicomdir"]);

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isLocalStudyId(studyId: string | undefined) {
  return Boolean(studyId?.startsWith("local-"));
}

async function waitForAiRunCompletion({
  initialRun,
  onRunUpdate,
  shouldContinue,
  studyId,
}: {
  initialRun: AiRun;
  onRunUpdate: (run: AiRun) => void;
  shouldContinue: () => boolean;
  studyId: string;
}) {
  let currentRun = initialRun;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= aiPollTimeoutMs) {
    if (!shouldContinue()) {
      return null;
    }

    onRunUpdate(currentRun);

    if (currentRun.status === "succeeded") {
      return currentRun;
    }

    if (currentRun.status === "failed") {
      throw new Error(currentRun.error || "Prediction IA echouee.");
    }

    if (currentRun.status === "cancelled") {
      throw new Error("Prediction IA annulee.");
    }

    await wait(aiPollIntervalMs);

    if (!shouldContinue()) {
      return null;
    }

    currentRun = (await Ai.getRun(studyId, currentRun.id)).data;
  }

  throw new Error("Prediction IA trop longue. Le run continue peut-etre cote backend.");
}

function formatAiRunStatus(run: AiRun) {
  if (run.status === "pending") {
    return "pending";
  }

  if (run.status === "running") {
    return "running";
  }

  if (run.status === "succeeded") {
    return "succeeded";
  }

  if (run.status === "failed") {
    return `failed${run.error ? ` - ${run.error}` : ""}`;
  }

  return run.status;
}

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
  localImport,
  viewer,
  volume,
}: {
  viewer: StudyViewerResponse | null;
  volume: StudyVolumeResponse | null;
  allowDicomFallback?: boolean;
  localImport?: LocalStudyImport | null;
}): CornerstoneViewerSource | null {
  if (localImport) {
    const series = localImport.localDicom.selectedSeries;
    const firstImage = series.images[0];
    const imageOrientation = firstImage?.imageOrientationPatient || [];
    const rowCosines = imageOrientation.slice(0, 3);
    const columnCosines = imageOrientation.slice(3, 6);
    const normalCosines =
      rowCosines.length === 3 && columnCosines.length === 3
        ? [
            rowCosines[1] * columnCosines[2] - rowCosines[2] * columnCosines[1],
            rowCosines[2] * columnCosines[0] - rowCosines[0] * columnCosines[2],
            rowCosines[0] * columnCosines[1] - rowCosines[1] * columnCosines[0],
          ]
        : [0, 0, 1];
    const slicePositions = series.images
      .map((image) => image.sortPosition)
      .filter((position): position is number => typeof position === "number" && Number.isFinite(position));
    const zSpacing =
      slicePositions.length > 1
        ? Math.abs(slicePositions[1] - slicePositions[0]) || series.sliceThickness || 1
        : series.sliceThickness || 1;
    const pixelSpacing = series.pixelSpacing || [1, 1];
    const spacing = [
      pixelSpacing[1] || 1,
      pixelSpacing[0] || 1,
      zSpacing,
    ];
    const origin = firstImage?.imagePositionPatient || [0, 0, 0];
    const direction = [
      rowCosines[0] ?? 1,
      columnCosines[0] ?? 0,
      normalCosines[0] ?? 0,
      rowCosines[1] ?? 0,
      columnCosines[1] ?? 1,
      normalCosines[1] ?? 0,
      rowCosines[2] ?? 0,
      columnCosines[2] ?? 0,
      normalCosines[2] ?? 1,
    ];
    const affine = [
      [
        direction[0] * spacing[0],
        direction[1] * spacing[1],
        direction[2] * spacing[2],
        origin[0],
      ],
      [
        direction[3] * spacing[0],
        direction[4] * spacing[1],
        direction[5] * spacing[2],
        origin[1],
      ],
      [
        direction[6] * spacing[0],
        direction[7] * spacing[1],
        direction[8] * spacing[2],
        origin[2],
      ],
    ];

    return {
      type: "dicom",
      imageIds: localImport.localDicom.selectedSeries.images.map((image) => image.imageId),
      emptyMessage: "Aucune image DICOM locale exploitable.",
      metadata: {
        affine,
        direction,
        intensity: {
          max: 3071,
          mean: 0,
          median: 0,
          min: -1024,
          p1: -1024,
          p5: -1024,
          p95: 1024,
          p99: 2048,
        },
        selected_files_count: series.images.length,
        selected_modality: series.modality,
        selected_protocol_name: series.protocolName,
        selected_series_description: series.seriesDescription,
        selected_series_instance_uid: series.seriesInstanceUid,
        shape: [
          firstImage?.columns || series.columns || 1,
          firstImage?.rows || series.rows || 1,
          series.images.length,
        ],
        origin,
        source_type: "dicom-local",
        spacing,
      },
    };
  }

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

function createLocalWorkspace(
  localImport: LocalStudyImport,
  backendWorkspace?: StudyWorkspace | null,
): StudyWorkspace {
  const backendReady = Boolean(
    localImport.backendStudyId && localImport.ctNiftiReady && localImport.aiReady,
  );

  return {
    ai: backendWorkspace?.ai || {
      modules: [],
      runs: [],
    },
    analyses: backendWorkspace?.analyses || {
      items: [],
      latest: null,
    },
    available_actions: backendWorkspace?.available_actions || {
      can_create_ai_run: backendReady,
      can_execute_ai: backendReady,
      can_prepare_volume: false,
      can_publish_segmentation: backendReady,
      can_run_label_hu_statistics: backendReady,
    },
    segmentations: backendWorkspace?.segmentations || {
      items: [],
      latest: null,
    },
    study: {
      created_at: localImport.createdAt,
      files_count: localImport.files.length,
      id: localImport.id,
      input_type: "dicom",
      status: localImport.status,
      updated_at: new Date().toISOString(),
    },
    viewer: backendWorkspace?.viewer || null,
    volume: {
      data: backendWorkspace?.volume.data || null,
      is_prepared: Boolean(backendWorkspace?.volume.is_prepared || backendReady),
    },
  };
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
    voxel: centerIjk,
    world: label.centerWorld || undefined,
    x: Math.max(0, Math.min(1, centerIjk[0] / maxX)),
    y: Math.max(0, Math.min(1, centerIjk[1] / maxY)),
  };
}

function getCrosshairTargetFromMeasurement(
  measurement: MedicalMeasurement,
  volume: StudyVolumeResponse | null,
): ViewerCrosshairTarget | null {
  const primaryPoint = getMeasurementPrimaryPoint(measurement);
  const voxel = primaryPoint.voxel;
  const shape = volume?.volume.metadata.shape;

  if (!voxel || !shape || shape.length < 3) {
    if (!primaryPoint.world) {
      return null;
    }

    return {
      world: primaryPoint.world,
      x: 0.5,
      y: 0.5,
    };
  }

  const maxX = Math.max(1, (shape[0] || 1) - 1);
  const maxY = Math.max(1, (shape[1] || 1) - 1);

  return {
    sliceIndices: {
      axial: voxel[2],
      coronal: voxel[1],
      sagittal: voxel[0],
    },
    voxel,
    world: primaryPoint.world,
    x: Math.max(0, Math.min(1, voxel[0] / maxX)),
    y: Math.max(0, Math.min(1, voxel[1] / maxY)),
  };
}

function getLocalImportStatusLabel(localImport: LocalStudyImport) {
  if (localImport.status === "LOCAL_ONLY") {
    return {
      backend: "en attente",
      conversion: "en attente",
      ia: "indisponible",
    };
  }

  if (localImport.status === "UPLOADING") {
    return {
      backend: `${localImport.uploadProgress} %`,
      conversion: "en attente",
      ia: "indisponible",
    };
  }

  if (localImport.status === "BACKEND_PROCESSING") {
    return {
      backend: "upload terminé",
      conversion: localImport.backendStatus || "en cours",
      ia: "disponible bientôt",
    };
  }

  if (localImport.status === "BACKEND_READY") {
    return {
      backend: "prêt",
      conversion: "ct.nii.gz prêt",
      ia: "disponible",
    };
  }

  if (localImport.status === "FAILED") {
    return {
      backend: "erreur",
      conversion: localImport.error || "échec",
      ia: "indisponible",
    };
  }

  return {
    backend: localImport.backendStatus || localImport.status,
    conversion: localImport.ctNiftiReady ? "ct.nii.gz prêt" : "en cours",
    ia: localImport.aiReady ? "disponible" : "indisponible",
  };
}

function LocalImportStatusBadge({ localImport }: { localImport: LocalStudyImport }) {
  const status = getLocalImportStatusLabel(localImport);

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 max-w-xs rounded border border-border-soft bg-surface/95 px-3 py-2 text-[11px] shadow-xl">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <span className="text-text-muted">Affichage local</span>
        <span className="font-semibold text-primary-200">prêt</span>
        <span className="text-text-muted">Upload backend</span>
        <span className="font-semibold text-text-soft">{status.backend}</span>
        <span className="text-text-muted">Conversion IA</span>
        <span className="font-semibold text-text-soft">{status.conversion}</span>
        <span className="text-text-muted">IA</span>
        <span className="font-semibold text-text-soft">{status.ia}</span>
      </div>
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
  localImport,
  inputType,
  maskLabels,
  maskOpacity,
  measurements,
  onAddMeasurement,
  onActiveToolChange,
  onMaskOverlayStatusChange,
  onPrepareVolume,
  onSelectMeasurement,
  onViewerModeChange,
  onWindowPresetChange,
  segmentationUrl,
  selectedMeasurementId,
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
  localImport: LocalStudyImport | null;
  inputType: string;
  maskLabels: MaskLabelState[];
  maskOpacity: number;
  measurements: MedicalMeasurement[];
  selectedMeasurementId: string | null;
  onAddMeasurement: (measurement: MedicalMeasurement) => void;
  onActiveToolChange: (tool: ViewerTool) => void;
  onMaskOverlayStatusChange: (status: MaskOverlayStatus) => void;
  onSelectMeasurement: (measurementId: string | null) => void;
  onPrepareVolume: () => void;
  segmentationUrl: string | null;
  studyId: string;
  viewerMode: ViewerLayoutMode;
  windowPreset: WindowPresetId;
  onViewerModeChange: (mode: ViewerLayoutMode) => void;
  onWindowPresetChange: (preset: WindowPresetId) => void;
}) {
  const cornerstoneSource = useMemo(
    () => getCornerstoneSource({ allowDicomFallback, localImport, viewer, volume }),
    [allowDicomFallback, localImport, viewer, volume],
  );
  const isReady = Boolean(cornerstoneSource);
  const unavailableMessage = getUnavailableViewerMessage(inputType);

  useEffect(() => {
    if (!import.meta.env.DEV || cornerstoneSource?.type !== "nifti") {
      return;
    }

    console.debug("[Workspace viewer source]", {
      preset: windowPreset,
      shape: cornerstoneSource.metadata?.shape,
      sourceType: cornerstoneSource.metadata?.source_type,
      studyId,
      volumeUrl: cornerstoneSource.url,
    });
  }, [cornerstoneSource, studyId, windowPreset]);

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
    <div className="relative h-full min-h-0">
      <CornerstoneViewer
        actionRequest={actionRequest}
        activeTool={activeTool}
        crosshairTarget={crosshairTarget}
        isMaskVisible={isMaskVisible}
        isReady={isReady}
        maskLabels={maskLabels}
        maskOpacity={maskOpacity}
        measurements={measurements}
        onAddMeasurement={onAddMeasurement}
        onActiveToolChange={onActiveToolChange}
        onMaskOverlayStatusChange={onMaskOverlayStatusChange}
        onSelectMeasurement={onSelectMeasurement}
        onViewerModeChange={onViewerModeChange}
        onWindowPresetChange={onWindowPresetChange}
        segmentationUrl={segmentationUrl}
        selectedMeasurementId={selectedMeasurementId}
        showControls={false}
        source={cornerstoneSource}
        studyId={studyId}
        viewerMode={viewerMode}
        windowPreset={windowPreset}
      />
      {localImport ? <LocalImportStatusBadge localImport={localImport} /> : null}
    </div>
  );
}

export default function Workspace() {
  const navigate = useNavigate();
  const { studyId } = useParams<{ studyId: string }>();
  const [localImportVersion, setLocalImportVersion] = useState(0);
  const [workspace, setWorkspace] = useState<StudyWorkspace | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [viewer, setViewer] = useState<StudyViewerResponse | null>(null);
  const [volume, setVolume] = useState<StudyVolumeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isAiPredicting, setIsAiPredicting] = useState(false);
  const [isAiPublishing, setIsAiPublishing] = useState(false);
  const [lastAiRun, setLastAiRun] = useState<AiRun | null>(null);
  const [publishedAiRunId, setPublishedAiRunId] = useState<string | null>(null);
  const [aiRunStatus, setAiRunStatus] = useState<string | null>(null);
  const [isAutoPreparing, setIsAutoPreparing] = useState(false);
  const [isMaskVisible, setIsMaskVisible] = useState(true);
  const [activeViewerTool, setActiveViewerTool] = useState<ViewerTool>("crosshair");
  const [viewerMode, setViewerMode] = useState<ViewerLayoutMode>("mpr");
  const [windowPreset, setWindowPreset] = useState<WindowPresetId>("soft");
  const [viewerActionRequest, setViewerActionRequest] = useState<ViewerActionRequest | null>(null);
  const [crosshairTarget, setCrosshairTarget] = useState<ViewerCrosshairTarget | null>(null);
  const [maskLabels, setMaskLabels] = useState<MaskLabelState[]>([]);
  const [maskLabelsMessage, setMaskLabelsMessage] = useState<string | null>(null);
  const [maskOverlayStatus, setMaskOverlayStatus] = useState<MaskOverlayStatus>("idle");
  const [maskOpacity, setMaskOpacity] = useState(0.6);
  const [error, setError] = useState<string | null>(null);
  const aiRunRequestIdRef = useRef(0);
  const autoPreparedStudyIdsRef = useRef<Set<string>>(new Set());
  const isWorkspaceMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const {
    addMeasurement,
    deleteMeasurement,
    measurements,
    resetMeasurements,
    selectedMeasurementId,
    selectMeasurement,
  } = useMeasurements(studyId);
  const localImport = useMemo(
    () => getLocalStudyImport(studyId),
    [localImportVersion, studyId],
  );
  const backendStudyId = localImport?.backendStudyId || null;
  const activeApiStudyId = backendStudyId || studyId;

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

      const loadRequestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = loadRequestId;

      try {
        const currentLocalImport = getLocalStudyImport(studyId);

        if (currentLocalImport && !currentLocalImport.backendStudyId) {
          setWorkspace(createLocalWorkspace(currentLocalImport));
          setStudies([]);
          setViewer(null);
          setVolume(null);
          setError(currentLocalImport.error);
          return;
        }

        if (isLocalStudyId(studyId) && !currentLocalImport) {
          throw new Error("Import local introuvable. Relancez l'import DICOM.");
        }

        const workspaceStudyId = currentLocalImport?.backendStudyId || studyId;
        const [workspaceResponse, studiesResponse, aiModulesResponse] = await Promise.all([
          WorkspaceApi.getWorkspace(workspaceStudyId),
          Studies.getStudies(),
          Ai.getModules(),
        ]);

        if (loadRequestId !== loadRequestIdRef.current) {
          return;
        }

        const backendWorkspace = {
          ...workspaceResponse.data,
          ai: {
            ...workspaceResponse.data.ai,
            modules: aiModulesResponse.data.items,
          },
        };
        const nextWorkspace = currentLocalImport
          ? createLocalWorkspace(currentLocalImport, backendWorkspace)
          : backendWorkspace;
        const nextViewer = normalizeViewer(nextWorkspace.viewer);
        const nextVolume = nextWorkspace.volume.data;

        setWorkspace(nextWorkspace);
        setStudies(studiesResponse.data.items);
        setViewer(nextViewer);
        setVolume(nextVolume);
        setError(null);
      } catch (loadError) {
        if (loadRequestId !== loadRequestIdRef.current) {
          return;
        }

        setError(getErrorMessage(loadError));
      } finally {
        if (loadRequestId === loadRequestIdRef.current) {
          setIsLoading(false);
        }
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
      if (!activeApiStudyId) {
        throw new Error("Identifiant d'etude manquant.");
      }

      await Studies.prepareStudy(activeApiStudyId);
    });
  };

  const publishAiRunSegmentation = useCallback(
    async (run: AiRun, requestId?: number) => {
      if (!activeApiStudyId) {
        throw new Error("Identifiant d'etude manquant.");
      }

      const shouldContinue = () =>
        requestId == null ||
        (isWorkspaceMountedRef.current && aiRunRequestIdRef.current === requestId);

      if (!shouldContinue()) {
        return;
      }

      setIsAiPublishing(true);
      setAiRunStatus("Publishing segmentation...");

      try {
        const segmentationResponse = await Ai.publishSegmentation(activeApiStudyId, run.id);

        if (!shouldContinue()) {
          return;
        }

        setPublishedAiRunId(run.id);
        setAiRunStatus("Segmentation ready");

        try {
          await Promise.all([
            Segmentations.getSegmentations(activeApiStudyId),
            Segmentations.getSegmentationLabels(activeApiStudyId, segmentationResponse.data.id),
          ]);
          setMaskLabelsMessage(null);
        } catch (labelsError) {
          setMaskLabelsMessage(
            `Segmentation published but labels failed: ${getErrorMessage(labelsError)}`,
          );
        }

        if (shouldContinue()) {
          await loadWorkspace();
        }
      } finally {
        if (shouldContinue()) {
          setIsAiPublishing(false);
        }
      }
    },
    [activeApiStudyId, loadWorkspace, studyId],
  );

  const handleRunAiPrediction = () => {
    if (isAiPredicting || isAiPublishing) {
      return;
    }

    const requestId = aiRunRequestIdRef.current + 1;
    aiRunRequestIdRef.current = requestId;
    setIsAiPredicting(true);
    setLastAiRun(null);
    setPublishedAiRunId(null);
    setAiRunStatus("Creating run...");
    setError(null);

    void (async () => {
      try {
        if (!activeApiStudyId || !workspace) {
          throw new Error("Workspace indisponible.");
        }

        if (localImport && (!localImport.backendStudyId || !localImport.ctNiftiReady || !localImport.aiReady)) {
          throw new Error("IA indisponible: backend pas encore prêt.");
        }

        const nnunetModule = workspace.ai.modules.find((module) => module.id === simulationModuleId);

        if (!nnunetModule) {
          throw new Error("Module IA ct_anatomy_segmentation_nnunet introuvable.");
        }

        if (!nnunetModule.is_available || nnunetModule.availability_error) {
          throw new Error(nnunetModule.availability_error || "Module IA indisponible.");
        }

        if (!workspace.volume.is_prepared) {
          throw new Error("Preparez le volume avant de lancer l'IA.");
        }

        if (!workspace.available_actions.can_execute_ai) {
          throw new Error("Execution IA indisponible pour cette etude.");
        }

        const payload: AiRunCreate = {
          module_id: simulationModuleId,
        };
        const shouldContinue = () =>
          isWorkspaceMountedRef.current && aiRunRequestIdRef.current === requestId;
        const runResponse = await Ai.createRun(activeApiStudyId, payload);
        const run = runResponse.data;

        if (!shouldContinue()) {
          return;
        }

        setLastAiRun(run);
        setAiRunStatus(`Created run ${run.id.slice(0, 8)} (${formatAiRunStatus(run)})`);
        const executionResponse = await Ai.executeRun(activeApiStudyId, run.id);

        if (!shouldContinue()) {
          return;
        }

        setAiRunStatus(`Running AI... (${formatAiRunStatus(executionResponse.data)})`);
        const completedRun = await waitForAiRunCompletion({
          initialRun: executionResponse.data,
          onRunUpdate: (nextRun) => {
            if (!shouldContinue()) {
              return;
            }

            setLastAiRun(nextRun);
            setAiRunStatus(formatAiRunStatus(nextRun));
          },
          shouldContinue,
          studyId: activeApiStudyId,
        });

        if (!completedRun || !shouldContinue()) {
          return;
        }

        setLastAiRun(completedRun);
        setAiRunStatus("succeeded");
        await publishAiRunSegmentation(completedRun, requestId);
      } catch (predictionError) {
        if (!isWorkspaceMountedRef.current || aiRunRequestIdRef.current !== requestId) {
          return;
        }

        const message = getErrorMessage(predictionError);

        setError(message);
        setAiRunStatus(`Failed - ${message}`);
      } finally {
        if (isWorkspaceMountedRef.current && aiRunRequestIdRef.current === requestId) {
          setIsAiPredicting(false);
        }
      }
    })();
  };

  const handlePublishAiSegmentation = () => {
    if (!lastAiRun || lastAiRun.status !== "succeeded" || lastAiRun.id === publishedAiRunId) {
      return;
    }

    void publishAiRunSegmentation(lastAiRun).catch((publishError) => {
      const message = getErrorMessage(publishError);

      setError(message);
      setAiRunStatus(`Publish failed - ${message}`);
    });
  };

  const handleUploadSegmentation = (file: File, name?: string, labelsFile?: File) => {
    void runAction(async () => {
      if (!activeApiStudyId || !workspace) {
        throw new Error("Workspace indisponible.");
      }

      if (!workspace.volume.is_prepared) {
        throw new Error("Preparez le volume avant d'importer un masque.");
      }

      await Segmentations.uploadManualSegmentation(activeApiStudyId, file, {
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
    setActiveViewerTool(tool);
  }, []);

  const handleViewerAction = useCallback((action: ViewerAction) => {
    if (action === "reset") {
      setActiveViewerTool("crosshair");
      resetMeasurements();
    }

    setViewerActionRequest((currentRequest) => ({
      action,
      id: (currentRequest?.id || 0) + 1,
    }));
  }, [resetMeasurements]);

  const handleFocusMeasurement = useCallback(
    (measurement: MedicalMeasurement) => {
      const nextCrosshairTarget = getCrosshairTargetFromMeasurement(measurement, volume);

      selectMeasurement(measurement.id);
      setActiveViewerTool("crosshair");
      setViewerMode("mpr");
      setCrosshairTarget(nextCrosshairTarget);
    },
    [selectMeasurement, volume],
  );

  useEffect(() => {
    void loadWorkspace(true);
  }, [loadWorkspace]);

  useEffect(() => subscribeLocalStudyImports(() => {
    setLocalImportVersion((version) => version + 1);
  }), []);

  useEffect(() => {
    if (!localImport) {
      return;
    }

    if (localImport.status === "LOCAL_ONLY") {
      startLocalStudyBackendImport(localImport.id);
    }

    setWorkspace((currentWorkspace) => createLocalWorkspace(localImport, currentWorkspace));

    if (localImport.status === "BACKEND_READY" && localImport.backendStudyId) {
      void loadWorkspace();
    }
  }, [
    loadWorkspace,
    localImport,
    localImport?.backendStudyId,
    localImport?.status,
    localImport?.uploadProgress,
  ]);

  useEffect(() => {
    isWorkspaceMountedRef.current = true;

    return () => {
      isWorkspaceMountedRef.current = false;
      aiRunRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    aiRunRequestIdRef.current += 1;
    setIsAiPredicting(false);
    setIsAiPublishing(false);
    setLastAiRun(null);
    setPublishedAiRunId(null);
    setAiRunStatus(null);
    setCrosshairTarget(null);
    setViewerMode("mpr");
    setWindowPreset("soft");
  }, [studyId]);

  useEffect(() => {
    const shortcutByKey: Partial<Record<string, ViewerTool>> = {
      c: "crosshair",
      d: "length",
      h: "hu",
      p: "pan",
      r: "circle_roi",
      s: "none",
      w: "window",
      z: "zoom",
    };

    function isEditableTarget(target: EventTarget | null) {
      const element = target instanceof HTMLElement ? target : null;
      const tagName = element?.tagName.toLowerCase();

      return (
        element?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select"
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveViewerTool("crosshair");
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedMeasurementId) {
          event.preventDefault();
          deleteMeasurement(selectedMeasurementId);
        }
        return;
      }

      const nextTool = shortcutByKey[event.key.toLowerCase()];

      if (!nextTool) {
        return;
      }

      event.preventDefault();
      setActiveViewerTool(nextTool);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteMeasurement, selectedMeasurementId]);

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

    if (localImport) {
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
  }, [isBusy, localImport, runAction, studyId, workspace]);

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
  const isAiModuleAvailable = Boolean(nnunetModule?.is_available && !nnunetModule.availability_error);
  const isLocalBackendReady = !localImport || Boolean(
    localImport.backendStudyId && localImport.ctNiftiReady && localImport.aiReady,
  );
  const canRunAi =
    isLocalBackendReady &&
    workspace.available_actions.can_create_ai_run &&
    workspace.available_actions.can_execute_ai &&
    workspace.volume.is_prepared &&
    isAiModuleAvailable &&
    !isAiPredicting &&
    !isAiPublishing;
  const aiUnavailableMessage =
    nnunetModule?.availability_error ||
    (localImport && !isLocalBackendReady
      ? "IA disponible quand l'import backend et ct.nii.gz sont prêts."
      : null) ||
    (!nnunetModule
      ? "Module IA ct_anatomy_segmentation_nnunet introuvable."
      : !workspace.volume.is_prepared
        ? "Préparez le volume avant de lancer l'IA."
        : !workspace.available_actions.can_execute_ai
          ? "Execution IA indisponible pour cette etude."
          : null);
  const aiModuleStatus = nnunetModule
    ? isAiModuleAvailable
      ? "Ready"
      : "Unavailable"
    : "Missing";
  const canPublishAiSegmentation =
    Boolean(lastAiRun && lastAiRun.status === "succeeded" && lastAiRun.id !== publishedAiRunId) &&
    !isAiPredicting &&
    !isAiPublishing;

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
          localImport={localImport}
          maskLabels={maskLabels}
          maskOpacity={maskOpacity}
          measurements={measurements}
          onAddMeasurement={addMeasurement}
          onActiveToolChange={handleActiveViewerToolChange}
          onMaskOverlayStatusChange={setMaskOverlayStatus}
          onSelectMeasurement={selectMeasurement}
          onPrepareVolume={handlePrepareVolume}
          onViewerModeChange={setViewerMode}
          onWindowPresetChange={setWindowPreset}
          segmentationUrl={segmentationUrl}
          selectedMeasurementId={selectedMeasurementId}
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
          aiModuleStatus={aiModuleStatus}
          aiUnavailableMessage={aiUnavailableMessage}
          aiRunStatus={aiRunStatus}
          canPublishAiSegmentation={canPublishAiSegmentation}
          canRunAi={canRunAi}
          isAiPredicting={isAiPredicting}
          isAiPublishing={isAiPublishing}
          isBusy={isWorkspaceBusy}
          isMaskVisible={isMaskVisible}
          maskLabels={maskLabels}
          maskLabelsMessage={maskLabelsMessage}
          maskOverlayStatus={maskOverlayStatus}
          maskOpacity={maskOpacity}
          measurements={measurements}
          onCenterMaskLabel={handleCenterMaskLabel}
          onDeleteMeasurement={deleteMeasurement}
          onFocusMeasurement={handleFocusMeasurement}
          onMaskOpacityChange={handleMaskOpacityChange}
          onPublishAiSegmentation={handlePublishAiSegmentation}
          onResetMeasurements={resetMeasurements}
          onRunAiPrediction={handleRunAiPrediction}
          onSelectMeasurement={selectMeasurement}
          onSetAllLabelsVisible={handleSetAllLabelsVisible}
          onSetGroupVisible={handleSetGroupVisible}
          onShowOnlyGroup={handleShowOnlyGroup}
          onToggleMask={() => setIsMaskVisible((value) => !value)}
          onToggleMaskLabel={handleToggleMaskLabel}
          onUploadSegmentation={handleUploadSegmentation}
          selectedMeasurementId={selectedMeasurementId}
          workspace={workspace}
        />
      }
      toolbar={
        <TopToolBar
          activeTool={activeViewerTool}
          aiModuleStatus={aiModuleStatus}
          aiRunStatus={aiRunStatus}
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
