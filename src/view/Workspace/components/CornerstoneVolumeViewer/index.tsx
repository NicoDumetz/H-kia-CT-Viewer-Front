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

import {
  Enums,
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader,
} from "@cornerstonejs/core";
import type { Types } from "@cornerstonejs/core";
import {
  annotation,
  Enums as ToolEnums,
  LengthTool,
  PanTool,
  ProbeTool,
  segmentation,
  StackScrollTool,
  ToolGroupManager,
  utilities as toolUtilities,
  WindowLevelTool,
  ZoomTool,
} from "@cornerstonejs/tools";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";

import { Measurements } from "~/api";
import { Button } from "~/components/Button";
import { VTKVolume3DViewer } from "../VTKVolume3DViewer";
import type {
  CornerstoneViewerSource,
  HuMeasurementPanelState,
  MaskOverlayStatus,
  ViewerActionRequest,
  ViewerCrosshairTarget,
  ViewerTool,
} from "../CornerstoneViewer";
import type { MaskLabelState } from "../MaskLabelsPanel";
import { LoadingState } from "~/components/LoadingState";
import { Toolbar } from "~/components/Toolbar";
import {
  cornerstoneToolGroupId,
  createNiftiImageIds,
  initCornerstone,
} from "~/helpers/Cornerstone";
import { cn } from "~/helpers/Cn";
import type {
  HuCircleMeasurement,
  MeasurementPlane,
} from "~/types/Measurements";

type WindowPresetId = "soft" | "bone" | "lung";
type ViewerMode = "mpr" | "axial" | "sagittal" | "coronal" | "volume3d";
type VolumeLayout = Exclude<ViewerMode, "volume3d">;
type MprViewportKey = Exclude<VolumeLayout, "mpr">;
type CornerstoneToolGroup = NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>;

type WindowPreset = {
  id: WindowPresetId;
  label: string;
  width: number;
  level: number;
};

type ViewportConfig = {
  key: MprViewportKey;
  id: string;
  label: string;
  orientation: Enums.OrientationAxis;
};

type VoiViewport = Types.IViewport & {
  setProperties?: (properties: { voiRange: { lower: number; upper: number } }) => void;
};

type ScrollableViewport = Types.IViewport & {
  scroll?: (delta: number) => void;
};

type ResettableViewport = Types.IViewport & {
  resetCamera?: (options?: {
    resetPan?: boolean;
    resetToCenter?: boolean;
    resetZoom?: boolean;
  }) => void;
  setProperties?: (properties: { voiRange: { lower: number; upper: number } }) => void;
};

type CrosshairPosition = {
  x: number;
  y: number;
};

type CanvasPoint = {
  x: number;
  y: number;
};

type CanvasWorldViewport = Types.IViewport & {
  canvasToWorld?: (canvasPos: Types.Point2) => Types.Point3;
  worldToCanvas?: (worldPos: Types.Point3) => Types.Point2;
};

type HuCircleDraft = {
  viewportId: string;
  plane: MeasurementPlane;
  centerCanvas: CanvasPoint;
  edgeCanvas: CanvasPoint | null;
  centerWorld: number[];
  edgeWorld: number[] | null;
  isFinalized: boolean;
};

type CornerstoneVolumeViewerProps = {
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>;
  activeTool?: ViewerTool;
  actionRequest?: ViewerActionRequest | null;
  crosshairTarget?: ViewerCrosshairTarget | null;
  isMaskVisible?: boolean;
  maskLabels?: MaskLabelState[];
  maskOpacity?: number;
  segmentationUrl?: string | null;
  onActiveToolChange?: (tool: ViewerTool) => void;
  onHuMeasurementChange?: (state: HuMeasurementPanelState) => void;
  onMaskOverlayStatusChange?: (status: MaskOverlayStatus) => void;
  studyId?: string;
  className?: string;
};

type VolumeRenderingAreaProps = {
  activePreset: WindowPresetId;
  activeTool: ViewerTool;
  actionRequest?: ViewerActionRequest | null;
  baseViewportId: string;
  clearTemporaryKey: number;
  crosshairTarget?: ViewerCrosshairTarget | null;
  isMaskVisible: boolean;
  layout: VolumeLayout;
  maskLabels: MaskLabelState[];
  maskOpacity: number;
  onActiveToolChange?: (tool: ViewerTool) => void;
  onHuMeasurementChange?: (state: HuMeasurementPanelState) => void;
  onMaskOverlayStatusChange?: (status: MaskOverlayStatus) => void;
  onPresetChange: (preset: WindowPresetId) => void;
  renderingEngineId: string;
  segmentationId: string;
  segmentationUrl?: string | null;
  segmentationVolumeId: string;
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>;
  studyId?: string;
  toolGroupId: string;
  volumeId: string;
};

const windowPresets: WindowPreset[] = [
  {
    id: "soft",
    label: "Soft",
    width: 400,
    level: 40,
  },
  {
    id: "bone",
    label: "Bone",
    width: 2000,
    level: 500,
  },
  {
    id: "lung",
    label: "Lung",
    width: 1500,
    level: -600,
  },
];

const primaryToolNames = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  LengthTool.toolName,
  ProbeTool.toolName,
] as string[];

const undoableToolNames = new Set<string>([LengthTool.toolName, ProbeTool.toolName]);

const toolNameByViewerTool: Partial<Record<ViewerTool, string>> = {
  length: LengthTool.toolName,
  pan: PanTool.toolName,
  window: WindowLevelTool.toolName,
  zoom: ZoomTool.toolName,
};

function getVoiRange(preset: WindowPreset) {
  const halfWidth = preset.width / 2;

  return {
    lower: preset.level - halfWidth,
    upper: preset.level + halfWidth,
  };
}

function getViewportConfigs(baseViewportId: string): ViewportConfig[] {
  return [
    {
      key: "axial",
      id: `${baseViewportId}-axial`,
      label: "Axial",
      orientation: Enums.OrientationAxis.AXIAL,
    },
    {
      key: "sagittal",
      id: `${baseViewportId}-sagittal`,
      label: "Sagittal",
      orientation: Enums.OrientationAxis.SAGITTAL,
    },
    {
      key: "coronal",
      id: `${baseViewportId}-coronal`,
      label: "Coronal",
      orientation: Enums.OrientationAxis.CORONAL,
    },
  ];
}

function getGridClassName(layout: VolumeLayout) {
  if (layout === "mpr") {
    return "grid grid-cols-2 grid-rows-2";
  }

  return "grid grid-cols-1 grid-rows-1";
}

function getViewportClassName(layout: VolumeLayout, viewportKey: MprViewportKey) {
  if (layout !== "mpr" && layout !== viewportKey) {
    return "hidden";
  }

  if (layout === "mpr" && viewportKey === "coronal") {
    return "col-span-2";
  }

  return "";
}

function getSourceKey(source: Extract<CornerstoneViewerSource, { type: "nifti" }>) {
  return `nifti-${source.url}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

function getPreset(presetId: WindowPresetId) {
  return windowPresets.find((item) => item.id === presetId) || windowPresets[0];
}

function applyWindowPreset(viewports: Types.IViewport[], presetId: WindowPresetId) {
  const preset = getPreset(presetId);

  viewports.forEach((viewport) => {
    const voiViewport = viewport as VoiViewport;

    if (!voiViewport.setProperties) {
      return;
    }

    voiViewport.setProperties({
      voiRange: getVoiRange(preset),
    });
    viewport.render();
  });
}

function waitForFinalPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function setPrimaryTool(toolGroup: CornerstoneToolGroup, tool: ViewerTool) {
  primaryToolNames.forEach((toolName) => {
    try {
      toolGroup.setToolPassive(toolName, { removeAllBindings: true });
    } catch {
      // ToolGroup may already be tearing down.
    }
  });

  const toolName = toolNameByViewerTool[tool];

  if (!toolName) {
    return;
  }

  toolGroup.setToolActive(toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
  });
}

function getLayoutViewportId(layout: VolumeLayout, configs: ViewportConfig[]) {
  if (layout === "mpr") {
    return configs[0]?.id || "";
  }

  return configs.find((config) => config.key === layout)?.id || configs[0]?.id || "";
}

function getSafeToolError() {
  return "Outil indisponible.";
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function getRelativePointerPosition(
  event: PointerEvent<HTMLElement>,
  element: HTMLElement | null | undefined,
): CrosshairPosition | null {
  const canvasPosition = getCanvasPointerPosition(event, element);

  if (!canvasPosition || !element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return {
    x: clamp(canvasPosition.x / rect.width),
    y: clamp(canvasPosition.y / rect.height),
  };
}

function getCanvasPointerPosition(
  event: PointerEvent<HTMLElement>,
  element: HTMLElement | null | undefined,
): CanvasPoint | null {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return null;
  }

  return {
    x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
    y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
  };
}

function getCanvasDistance(start: CanvasPoint, end: CanvasPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  return Math.sqrt(dx * dx + dy * dy);
}

function getHuCircleRadius(draft: HuCircleDraft) {
  return getCanvasDistance(draft.centerCanvas, draft.edgeCanvas || draft.centerCanvas);
}

function getHuAnnotationPosition(
  draft: HuCircleDraft,
  viewportElement: HTMLElement | null | undefined,
) {
  const radius = getHuCircleRadius(draft);
  const viewportWidth = viewportElement?.clientWidth || 0;
  const viewportHeight = viewportElement?.clientHeight || 0;
  const labelWidth = 168;
  const labelHeight = 86;
  const gap = 12;
  let left = draft.centerCanvas.x + radius + gap;
  let top = draft.centerCanvas.y - labelHeight / 2;

  if (viewportWidth && left + labelWidth > viewportWidth - gap) {
    left = draft.centerCanvas.x - radius - labelWidth - gap;
  }

  if (viewportWidth) {
    left = Math.max(gap, Math.min(left, viewportWidth - labelWidth - gap));
  }

  if (viewportHeight) {
    top = Math.max(gap, Math.min(top, viewportHeight - labelHeight - gap));
  } else {
    top = Math.max(gap, top);
  }

  return { left, top };
}

function getHuAnnotationLines(
  draft: HuCircleDraft,
  result: HuCircleMeasurement | null,
  isLoading: boolean,
) {
  if (!draft.edgeCanvas) {
    return ["Centre HU", "Déplacez pour définir le rayon"];
  }

  if (!draft.isFinalized) {
    return [
      `Rayon ${Math.round(getHuCircleRadius(draft))} px`,
      "Cliquez pour valider",
    ];
  }

  if (isLoading) {
    return ["Calcul HU..."];
  }

  if (!result) {
    return ["Calcul HU en attente"];
  }

  return [
    `Mean ${Math.round(result.hu.mean)} HU`,
    `Median ${Math.round(result.hu.median)} HU`,
    `Min/Max ${Math.round(result.hu.min)}/${Math.round(result.hu.max)}`,
  ];
}

function getPlaneByViewportId(
  viewportId: string,
  configs: ViewportConfig[],
): MeasurementPlane | null {
  return configs.find((config) => config.id === viewportId)?.key || null;
}

function getWorldPoint(
  viewport: Types.IViewport | undefined,
  point: CanvasPoint,
): number[] | null {
  const canvasWorldViewport = viewport as CanvasWorldViewport | undefined;

  if (!canvasWorldViewport?.canvasToWorld) {
    return null;
  }

  try {
    const worldPoint = canvasWorldViewport.canvasToWorld([point.x, point.y]);

    return [worldPoint[0], worldPoint[1], worldPoint[2]].map((value) => Number(value));
  } catch {
    return null;
  }
}

function getMeasurementErrorMessage(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const response = record?.response;
  const responseRecord = response && typeof response === "object" ? (response as Record<string, unknown>) : null;
  const data = responseRecord?.data;
  const dataRecord = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const detail = dataRecord?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Calcul HU indisponible.";
}

function createMaskColorLUT(): Types.ColorLUT {
  const lut: Types.ColorLUT = [[0, 0, 0, 0]];

  for (let index = 1; index < 256; index += 1) {
    const hue = (index * 47) % 360;
    const saturation = 0.78;
    const lightness = 0.54;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const hueSegment = hue / 60;
    const x = chroma * (1 - Math.abs((hueSegment % 2) - 1));
    const match = lightness - chroma / 2;
    const [r1, g1, b1] =
      hueSegment < 1
        ? [chroma, x, 0]
        : hueSegment < 2
          ? [x, chroma, 0]
          : hueSegment < 3
            ? [0, chroma, x]
            : hueSegment < 4
              ? [0, x, chroma]
              : hueSegment < 5
                ? [x, 0, chroma]
                : [chroma, 0, x];

    lut[index] = [
      Math.round((r1 + match) * 255),
      Math.round((g1 + match) * 255),
      Math.round((b1 + match) * 255),
      190,
    ];
  }

  return lut;
}

function removeSegmentationQuietly(segmentationId: string) {
  try {
    segmentation.removeSegmentation(segmentationId);
  } catch {
    // Segmentation may not exist yet.
  }
}

function setMaskRepresentationVisibility(
  viewportIds: string[],
  segmentationId: string,
  visible: boolean,
) {
  viewportIds.forEach((viewportId) => {
    segmentation.config.visibility.setSegmentationRepresentationVisibility(
      viewportId,
      {
        segmentationId,
        type: ToolEnums.SegmentationRepresentations.Labelmap,
      },
      visible,
    );
  });
}

function setMaskSegmentVisibility(
  viewportIds: string[],
  segmentationId: string,
  maskLabels: MaskLabelState[],
  isMaskVisible: boolean,
) {
  viewportIds.forEach((viewportId) => {
    maskLabels.forEach((label) => {
      segmentation.config.visibility.setSegmentIndexVisibility(
        viewportId,
        {
          segmentationId,
          type: ToolEnums.SegmentationRepresentations.Labelmap,
        },
        label.labelId,
        isMaskVisible && label.isVisible,
      );
    });
  });
}

function setMaskOpacity(viewportIds: string[], segmentationId: string, opacity: number) {
  const fillAlpha = Math.max(0.05, Math.min(1, opacity));

  viewportIds.forEach((viewportId) => {
    segmentation.config.style.setStyle(
      {
        segmentationId,
        viewportId,
        type: ToolEnums.SegmentationRepresentations.Labelmap,
      },
      {
        fillAlpha,
        fillAlphaInactive: fillAlpha,
        outlineOpacity: 1,
        outlineOpacityInactive: 1,
        outlineWidth: 2,
        outlineWidthInactive: 2,
        renderFill: true,
        renderFillInactive: true,
        renderOutline: true,
        renderOutlineInactive: true,
      },
      true,
    );
  });
}

function VolumeRenderingArea({
  actionRequest,
  activePreset,
  activeTool,
  baseViewportId,
  clearTemporaryKey,
  crosshairTarget,
  isMaskVisible,
  layout,
  maskLabels,
  maskOpacity,
  onActiveToolChange,
  onHuMeasurementChange,
  onMaskOverlayStatusChange,
  onPresetChange,
  renderingEngineId,
  segmentationId,
  segmentationUrl,
  segmentationVolumeId,
  source,
  studyId,
  toolGroupId,
  volumeId,
}: VolumeRenderingAreaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportElementsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const activeViewportIdRef = useRef<string | null>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const setupTokenRef = useRef(0);
  const viewportsRef = useRef<Types.IViewport[]>([]);
  const viewportsByIdRef = useRef<Record<string, Types.IViewport | undefined>>({});
  const isRenderingReadyRef = useRef(false);
  const isMaskVisibleRef = useRef(isMaskVisible);
  const isMaskOverlayLoadedRef = useRef(false);
  const maskLabelsRef = useRef(maskLabels);
  const maskOpacityRef = useRef(maskOpacity);
  const activePresetRef = useRef(activePreset);
  const activeToolRef = useRef(activeTool);
  const lastModeToolRef = useRef<ViewerTool>("crosshair");
  const huCircleDraftRef = useRef<HuCircleDraft | null>(null);
  const handledActionRequestIdRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crosshairPosition, setCrosshairPosition] = useState<CrosshairPosition>({
    x: 0.5,
    y: 0.5,
  });
  const [huCircleDraft, setHuCircleDraft] = useState<HuCircleDraft | null>(null);
  const [huResult, setHuResult] = useState<HuCircleMeasurement | null>(null);
  const [isHuLoading, setIsHuLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [maskOverlayStatus, setMaskOverlayStatus] = useState<MaskOverlayStatus>("idle");
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const viewportConfigs = useMemo(() => getViewportConfigs(baseViewportId), [baseViewportId]);
  const viewportIds = useMemo(
    () => viewportConfigs.map((config) => config.id),
    [viewportConfigs],
  );

  const clearHuMeasurement = useCallback(() => {
    huCircleDraftRef.current = null;
    setHuCircleDraft(null);
    setHuResult(null);
    setIsHuLoading(false);
    onHuMeasurementChange?.({ status: "idle" });
  }, [onHuMeasurementChange]);

  const updateMaskOverlayStatus = useCallback(
    (status: MaskOverlayStatus) => {
      setMaskOverlayStatus(status);
      onMaskOverlayStatusChange?.(status);
    },
    [onMaskOverlayStatusChange],
  );

  const setViewportElement = useCallback((id: string, element: HTMLDivElement | null) => {
    viewportElementsRef.current[id] = element;

    if (element && !activeViewportIdRef.current) {
      activeViewportIdRef.current = id;
    }
  }, []);

  const handleViewportWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>, viewportId: string) => {
      const viewport =
        viewportsByIdRef.current[viewportId] || renderingEngineRef.current?.getViewport(viewportId);
      const scrollableViewport = viewport as ScrollableViewport | undefined;
      const delta = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;

      if (!delta || !scrollableViewport?.scroll) {
        return;
      }

      event.preventDefault();

      try {
        scrollableViewport.scroll(delta);
        scrollableViewport.render();
        clearHuMeasurement();
        setToolMessage(null);
      } catch {
        // Some Cornerstone viewport implementations do not expose local scroll.
      }
    },
    [clearHuMeasurement],
  );

  const updateCrosshairPositionFromEvent = useCallback(
    (event: PointerEvent<HTMLElement>, viewportId: string) => {
      const position = getRelativePointerPosition(event, viewportElementsRef.current[viewportId]);

      if (!position) {
        return;
      }

      activeViewportIdRef.current = viewportId;
      setCrosshairPosition(position);
    },
    [],
  );

  const handleViewportPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      if (activeToolRef.current === "hu") {
        return;
      }

      updateCrosshairPositionFromEvent(event, viewportId);
    },
    [updateCrosshairPositionFromEvent],
  );

  const handleViewportPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      if (activeToolRef.current === "hu" || event.buttons !== 1) {
        return;
      }

      updateCrosshairPositionFromEvent(event, viewportId);
    },
    [updateCrosshairPositionFromEvent],
  );

  const finalizeHuCircle = useCallback(
    async (draft: HuCircleDraft) => {
      if (!studyId || !draft.edgeWorld) {
        const message = !studyId
          ? "Etude indisponible pour la mesure HU."
          : "Définissez un rayon avant de valider la mesure HU.";

        setToolMessage(message);
        onHuMeasurementChange?.({ message, status: "error" });
        return;
      }

      setIsHuLoading(true);
      setToolMessage(null);
      onHuMeasurementChange?.({ status: "loading" });

      try {
        const response = await Measurements.createHuCircleMeasurement(studyId, {
          center_world: draft.centerWorld,
          edge_world: draft.edgeWorld,
          plane: draft.plane,
        });

        setHuResult(response.data);
        onHuMeasurementChange?.({ result: response.data, status: "success" });
      } catch (measurementError) {
        const message = getMeasurementErrorMessage(measurementError);

        setToolMessage(message);
        onHuMeasurementChange?.({ message, status: "error" });
      } finally {
        setIsHuLoading(false);
      }
    },
    [onHuMeasurementChange, studyId],
  );

  const handleHuPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      const point = getCanvasPointerPosition(event, viewportElementsRef.current[viewportId]);
      const plane = getPlaneByViewportId(viewportId, viewportConfigs);
      const viewport =
        viewportsByIdRef.current[viewportId] || renderingEngineRef.current?.getViewport(viewportId);

      if (!point || !plane) {
        return;
      }

      const worldPoint = getWorldPoint(viewport, point);

      if (!worldPoint) {
        setToolMessage("Coordonnées monde indisponibles pour la mesure HU.");
        onHuMeasurementChange?.({
          message: "Coordonnées monde indisponibles pour la mesure HU.",
          status: "error",
        });
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      activeViewportIdRef.current = viewportId;
      setToolMessage(null);
      setCrosshairPosition(getRelativePointerPosition(event, viewportElementsRef.current[viewportId]) || crosshairPosition);
      const currentDraft = huCircleDraftRef.current;

      if (currentDraft && !currentDraft.isFinalized && currentDraft.viewportId === viewportId) {
        const nextDraft = {
          ...currentDraft,
          edgeCanvas: point,
          edgeWorld: worldPoint,
          isFinalized: true,
        };

        huCircleDraftRef.current = nextDraft;
        setHuCircleDraft(nextDraft);
        void finalizeHuCircle(nextDraft);
        return;
      }

      const nextDraft = {
        centerCanvas: point,
        centerWorld: worldPoint,
        edgeCanvas: null,
        edgeWorld: null,
        isFinalized: false,
        plane,
        viewportId,
      };

      huCircleDraftRef.current = nextDraft;
      setHuCircleDraft(nextDraft);
      setHuResult(null);
      onHuMeasurementChange?.({ status: "draft" });
    },
    [crosshairPosition, finalizeHuCircle, onHuMeasurementChange, viewportConfigs],
  );

  const handleHuPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      const point = getCanvasPointerPosition(event, viewportElementsRef.current[viewportId]);
      const viewport =
        viewportsByIdRef.current[viewportId] || renderingEngineRef.current?.getViewport(viewportId);
      const currentDraft = huCircleDraftRef.current;

      if (
        !point ||
        !currentDraft ||
        currentDraft.isFinalized ||
        currentDraft.viewportId !== viewportId
      ) {
        return;
      }

      const worldPoint = getWorldPoint(viewport, point);
      const nextDraft = {
        ...currentDraft,
        edgeCanvas: point,
        edgeWorld: worldPoint || currentDraft.edgeWorld,
      };

      huCircleDraftRef.current = nextDraft;
      setHuCircleDraft(nextDraft);
    },
    [],
  );

  const resetViewer = useCallback(() => {
    const preset = windowPresets[0];

    viewportsRef.current.forEach((viewport) => {
      const resettableViewport = viewport as ResettableViewport;

      resettableViewport.resetCamera?.({
        resetPan: true,
        resetToCenter: true,
        resetZoom: true,
      });

      resettableViewport.setProperties?.({
        voiRange: getVoiRange(preset),
      });

      viewport.render();
    });

    setCrosshairPosition({ x: 0.5, y: 0.5 });
    clearHuMeasurement();
    setToolMessage(null);
    onPresetChange(preset.id);
    onActiveToolChange?.("crosshair");
  }, [clearHuMeasurement, onActiveToolChange, onPresetChange]);

  const captureActiveViewport = useCallback(() => {
    const activeElement = activeViewportIdRef.current
      ? viewportElementsRef.current[activeViewportIdRef.current]
      : null;
    const canvas =
      activeElement?.querySelector("canvas") || containerRef.current?.querySelector("canvas");

    if (!canvas) {
      setToolMessage("Capture indisponible.");
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setToolMessage("Capture indisponible.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "hekia-capture.png";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToolMessage(null);
    }, "image/png");
  }, []);

  const undoLastAnnotation = useCallback(() => {
    const annotations = annotation.state.getAllAnnotations();
    const candidate = [...annotations]
      .reverse()
      .find((item) => {
        const toolName = item.metadata?.toolName;

        return Boolean(item.annotationUID) && item.isVisible !== false && undoableToolNames.has(toolName || "");
      });

    if (!candidate?.annotationUID) {
      setToolMessage("Aucune annotation à supprimer.");
      return;
    }

    annotation.state.removeAnnotation(candidate.annotationUID);
    toolUtilities.triggerAnnotationRenderForViewportIds(viewportIds);
    renderingEngineRef.current?.renderViewports(viewportIds);
    setToolMessage(null);
  }, [viewportIds]);

  useEffect(() => {
    activePresetRef.current = activePreset;
    applyWindowPreset(viewportsRef.current, activePreset);
  }, [activePreset]);

  useEffect(() => {
    activeToolRef.current = activeTool;

    if (activeTool !== "none") {
      lastModeToolRef.current = activeTool;
    }

    if (activeTool === "hu" && !huResult) {
      onHuMeasurementChange?.({ status: huCircleDraft ? "draft" : "idle" });
    }

    if (activeTool !== "hu") {
      clearHuMeasurement();
    }
  }, [activeTool, clearHuMeasurement, huCircleDraft, huResult, onHuMeasurementChange]);

  useEffect(() => {
    clearHuMeasurement();
    setToolMessage(null);

    const frameId = requestAnimationFrame(() => {
      const renderingEngine = renderingEngineRef.current;

      if (!isRenderingReadyRef.current || !renderingEngine) {
        return;
      }

      try {
        renderingEngine.resize(true, false);
        renderingEngine.renderViewports(viewportIds);
      } catch {
        // The 2D engine may still be settling after a mode transition.
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [clearHuMeasurement, clearTemporaryKey, viewportIds]);

  useEffect(() => {
    isMaskVisibleRef.current = isMaskVisible;
  }, [isMaskVisible]);

  useEffect(() => {
    maskLabelsRef.current = maskLabels;
  }, [maskLabels]);

  useEffect(() => {
    maskOpacityRef.current = maskOpacity;
  }, [maskOpacity]);

  useEffect(() => {
    if (!crosshairTarget) {
      return;
    }

    setCrosshairPosition({
      x: clamp(crosshairTarget.x),
      y: clamp(crosshairTarget.y),
    });
  }, [crosshairTarget]);

  useEffect(() => {
    const nextViewportId = getLayoutViewportId(layout, viewportConfigs);

    if (layout !== "mpr" || !activeViewportIdRef.current) {
      activeViewportIdRef.current = nextViewportId;
    }
  }, [layout, viewportConfigs]);

  useEffect(() => {
    if (!actionRequest || handledActionRequestIdRef.current === actionRequest.id) {
      return;
    }

    handledActionRequestIdRef.current = actionRequest.id;

    if (actionRequest.action === "capture") {
      captureActiveViewport();
      return;
    }

    if (actionRequest.action === "reset") {
      resetViewer();
      return;
    }

    if (actionRequest.action === "undo") {
      undoLastAnnotation();
    }
  }, [actionRequest, captureActiveViewport, resetViewer, undoLastAnnotation]);

  useEffect(() => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    if (!toolGroup) {
      return;
    }

    try {
      setPrimaryTool(toolGroup, activeTool);
      setToolMessage(null);
    } catch {
      setToolMessage(getSafeToolError());

      try {
        setPrimaryTool(toolGroup, "window");
        onActiveToolChange?.("window");
      } catch {
        // Keep the viewer interactive through wheel scroll even if a tool fails.
      }
    }
  }, [activeTool, onActiveToolChange, toolGroupId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") {
        return;
      }

      event.preventDefault();
      undoLastAnnotation();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undoLastAnnotation]);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const renderingEngine = renderingEngineRef.current;

        if (!isRenderingReadyRef.current || !renderingEngine) {
          return;
        }

        try {
          renderingEngine.resize(true, false);
          renderingEngine.renderViewports(viewportIds);
        } catch {
          // Layout can change while Cornerstone is still finishing teardown.
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [layout, viewportIds]);

  useEffect(() => {
    setupTokenRef.current += 1;
    const setupToken = setupTokenRef.current;
    let isCancelled = false;
    let renderingEngine: RenderingEngine | null = null;
    const resizeObserver = new ResizeObserver(() => {
      const currentRenderingEngine = renderingEngineRef.current;

      if (!isRenderingReadyRef.current || !currentRenderingEngine) {
        return;
      }

      try {
        currentRenderingEngine.resize(true, false);
      } catch {
        // Resize can fire during teardown while WebGL resources are already gone.
      }
    });

    async function setup() {
      const viewportInputs = viewportConfigs
        .map((config) => {
          const element = viewportElementsRef.current[config.id];

          if (!element) {
            return null;
          }

          return {
            element,
            type: Enums.ViewportType.ORTHOGRAPHIC,
            viewportId: config.id,
            defaultOptions: {
              background: [0, 0, 0] as Types.Point3,
              orientation: config.orientation,
            },
          };
        })
        .filter((input): input is NonNullable<typeof input> => Boolean(input));

      setIsLoading(true);
      setIsSceneReady(false);
      setError(null);
      setToolMessage(null);
      updateMaskOverlayStatus("idle");
      isRenderingReadyRef.current = false;
      isMaskOverlayLoadedRef.current = false;
      renderingEngineRef.current = null;
      viewportsRef.current = [];
      viewportsByIdRef.current = {};
      ToolGroupManager.destroyToolGroup(toolGroupId);

      try {
        await initCornerstone();

        if (isCancelled || setupToken !== setupTokenRef.current) {
          return;
        }

        const imageIds = await createNiftiImageIds(source.url);

        if (isCancelled || setupToken !== setupTokenRef.current) {
          return;
        }

        if (!imageIds.length) {
          throw new Error("Aucune image NIfTI exploitable pour Cornerstone3D.");
        }

        if (viewportInputs.length !== viewportConfigs.length) {
          throw new Error("Aucun viewport disponible pour Cornerstone3D.");
        }

        renderingEngine = new RenderingEngine(renderingEngineId);
        renderingEngine.setViewports(viewportInputs);

        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

        if (!toolGroup) {
          throw new Error("Impossible de creer le tool group Cornerstone.");
        }

        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(PanTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
        toolGroup.addTool(StackScrollTool.toolName);
        toolGroup.addTool(LengthTool.toolName);
        toolGroup.addTool(ProbeTool.toolName);

        viewportIds.forEach((viewportId) => {
          toolGroup.addViewport(viewportId, renderingEngineId);
        });

        toolGroup.setToolActive(StackScrollTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
        });

        try {
          setPrimaryTool(toolGroup, activeToolRef.current);
        } catch {
          setPrimaryTool(toolGroup, "window");
        }

        const volume = await volumeLoader.createAndCacheVolume(volumeId, {
          imageIds,
        });

        await volume.load();

        if (isCancelled || setupToken !== setupTokenRef.current) {
          renderingEngine.destroy();
          renderingEngine = null;
          ToolGroupManager.destroyToolGroup(toolGroupId);
          return;
        }

        await setVolumesForViewports(
          renderingEngine,
          [
            {
              volumeId,
            },
          ],
          viewportIds,
        );

        const nextViewports = viewportIds.map((viewportId) => renderingEngine!.getViewport(viewportId));

        activeViewportIdRef.current = viewportIds[0] || null;
        renderingEngineRef.current = renderingEngine;
        viewportsRef.current = nextViewports;
        viewportsByIdRef.current = Object.fromEntries(
          viewportIds.map((viewportId, index) => [viewportId, nextViewports[index]]),
        );
        isRenderingReadyRef.current = true;
        viewportInputs.forEach((input) => resizeObserver.observe(input.element));

        applyWindowPreset(nextViewports, activePresetRef.current);
        renderingEngine.resize(true, false);
        renderingEngine.renderViewports(viewportIds);

        await waitForFinalPaint();

        if (!isCancelled && setupToken === setupTokenRef.current) {
          setIsSceneReady(true);
        }
      } catch (setupError) {
        resizeObserver.disconnect();
        isRenderingReadyRef.current = false;
        isMaskOverlayLoadedRef.current = false;
        renderingEngine?.destroy();
        renderingEngine = null;
        renderingEngineRef.current = null;
        viewportsRef.current = [];
        viewportsByIdRef.current = {};
        ToolGroupManager.destroyToolGroup(toolGroupId);
        updateMaskOverlayStatus("idle");

        if (!isCancelled && setupToken === setupTokenRef.current) {
          setError(
            setupError instanceof Error
              ? setupError.message || "Viewer Cornerstone indisponible."
              : "Viewer Cornerstone indisponible.",
          );
        }
      } finally {
        if (!isCancelled && setupToken === setupTokenRef.current) {
          setIsLoading(false);
        }
      }
    }

    void setup();

    return () => {
      isCancelled = true;
      setupTokenRef.current += 1;
      isRenderingReadyRef.current = false;
      isMaskOverlayLoadedRef.current = false;
      resizeObserver.disconnect();
      renderingEngine?.destroy();
      renderingEngineRef.current?.destroy();
      renderingEngineRef.current = null;
      viewportsRef.current = [];
      viewportsByIdRef.current = {};
      ToolGroupManager.destroyToolGroup(toolGroupId);
      updateMaskOverlayStatus("idle");
    };
  }, [
    renderingEngineId,
    source.url,
    toolGroupId,
    updateMaskOverlayStatus,
    viewportConfigs,
    viewportIds,
    volumeId,
  ]);

  useEffect(() => {
    if (!segmentationUrl) {
      isMaskOverlayLoadedRef.current = false;
      removeSegmentationQuietly(segmentationId);
      updateMaskOverlayStatus("idle");
      return;
    }

    if (!isSceneReady || !isRenderingReadyRef.current || !renderingEngineRef.current) {
      updateMaskOverlayStatus("loading");
      return;
    }

    let isCancelled = false;
    const currentSegmentationUrl = segmentationUrl;

    async function setupSegmentationOverlay() {
      updateMaskOverlayStatus("loading");
      isMaskOverlayLoadedRef.current = false;

      try {
        const imageIds = await createNiftiImageIds(currentSegmentationUrl);

        if (isCancelled) {
          return;
        }

        if (!imageIds.length) {
          throw new Error("Aucune image NIfTI exploitable pour le masque.");
        }

        const segmentationVolume = await volumeLoader.createAndCacheVolume(segmentationVolumeId, {
          imageIds,
        });

        await segmentationVolume.load();

        if (isCancelled) {
          return;
        }

        removeSegmentationQuietly(segmentationId);
        segmentation.addSegmentations([
          {
            segmentationId,
            representation: {
              type: ToolEnums.SegmentationRepresentations.Labelmap,
              data: {
                referencedVolumeId: volumeId,
                volumeId: segmentationVolumeId,
              },
            },
            config: {
              label: "Masque Hekia",
            },
          },
        ]);
        segmentation.addLabelmapRepresentationToViewportMap(
          Object.fromEntries(
            viewportIds.map((viewportId) => [
              viewportId,
              [
                {
                  segmentationId,
                  config: {
                    colorLUTOrIndex: createMaskColorLUT(),
                  },
                },
              ],
            ]),
          ),
        );
        setMaskOpacity(viewportIds, segmentationId, maskOpacityRef.current);
        setMaskRepresentationVisibility(viewportIds, segmentationId, isMaskVisibleRef.current);
        setMaskSegmentVisibility(
          viewportIds,
          segmentationId,
          maskLabelsRef.current,
          isMaskVisibleRef.current,
        );
        isMaskOverlayLoadedRef.current = true;
        updateMaskOverlayStatus(isMaskVisibleRef.current ? "active" : "hidden");
        renderingEngineRef.current?.renderViewports(viewportIds);
      } catch (overlayError) {
        isMaskOverlayLoadedRef.current = false;
        removeSegmentationQuietly(segmentationId);
        updateMaskOverlayStatus("unavailable");

        if (import.meta.env.DEV) {
          console.warn("[Cornerstone mask overlay]", overlayError);
        }
      }
    }

    void setupSegmentationOverlay();

    return () => {
      isCancelled = true;
      isMaskOverlayLoadedRef.current = false;
      removeSegmentationQuietly(segmentationId);
    };
  }, [
    isSceneReady,
    segmentationId,
    segmentationUrl,
    segmentationVolumeId,
    updateMaskOverlayStatus,
    viewportIds,
    volumeId,
  ]);

  useEffect(() => {
    if (!segmentationUrl || !isMaskOverlayLoadedRef.current) {
      return;
    }

    try {
      setMaskRepresentationVisibility(viewportIds, segmentationId, isMaskVisible);
      updateMaskOverlayStatus(isMaskVisible ? "active" : "hidden");
      renderingEngineRef.current?.renderViewports(viewportIds);
    } catch (visibilityError) {
      isMaskOverlayLoadedRef.current = false;
      updateMaskOverlayStatus("unavailable");

      if (import.meta.env.DEV) {
        console.warn("[Cornerstone mask visibility]", visibilityError);
      }
    }
  }, [isMaskVisible, segmentationId, segmentationUrl, updateMaskOverlayStatus, viewportIds]);

  useEffect(() => {
    if (!segmentationUrl || !isMaskOverlayLoadedRef.current) {
      return;
    }

    try {
      setMaskSegmentVisibility(viewportIds, segmentationId, maskLabels, isMaskVisible);
      renderingEngineRef.current?.renderViewports(viewportIds);
    } catch (visibilityError) {
      updateMaskOverlayStatus("unavailable");

      if (import.meta.env.DEV) {
        console.warn("[Cornerstone mask segment visibility]", visibilityError);
      }
    }
  }, [
    isMaskVisible,
    maskLabels,
    segmentationId,
    segmentationUrl,
    updateMaskOverlayStatus,
    viewportIds,
  ]);

  useEffect(() => {
    if (!segmentationUrl || !isMaskOverlayLoadedRef.current) {
      return;
    }

    try {
      setMaskOpacity(viewportIds, segmentationId, maskOpacity);
      renderingEngineRef.current?.renderViewports(viewportIds);
    } catch (opacityError) {
      updateMaskOverlayStatus("unavailable");

      if (import.meta.env.DEV) {
        console.warn("[Cornerstone mask opacity]", opacityError);
      }
    }
  }, [maskOpacity, segmentationId, segmentationUrl, updateMaskOverlayStatus, viewportIds]);

  const shouldShowLoading = !error && (isLoading || !isSceneReady);

  return (
    <div className="contents" ref={containerRef}>
      {viewportConfigs.map((config) => (
        <div
          className={cn(
            "relative min-h-0 overflow-hidden rounded border border-border-soft bg-black",
            getViewportClassName(layout, config.key),
          )}
          key={config.id}
          onMouseEnter={() => {
            activeViewportIdRef.current = config.id;
          }}
          onPointerDown={(event) => handleViewportPointerDown(event, config.id)}
          onPointerMove={(event) => handleViewportPointerMove(event, config.id)}
        >
          <div className="absolute left-2 top-2 z-10 rounded bg-black/60 px-2 py-1 text-xs font-medium text-text-muted">
            {config.label}
          </div>
          <div
            className="h-full w-full"
            onWheel={(event) => handleViewportWheel(event, config.id)}
            ref={(element) => setViewportElement(config.id, element)}
          />
          {layout === "mpr" || activeTool === "crosshair" ? (
            <div className="pointer-events-none absolute inset-0 z-20">
              <div
                className="absolute top-0 w-px bg-primary/80"
                style={{
                  height: `calc(${crosshairPosition.y * 100}% - 12px)`,
                  left: `${crosshairPosition.x * 100}%`,
                }}
              />
              <div
                className="absolute bottom-0 w-px bg-primary/80"
                style={{
                  left: `${crosshairPosition.x * 100}%`,
                  top: `calc(${crosshairPosition.y * 100}% + 12px)`,
                }}
              />
              <div
                className="absolute left-0 h-px bg-primary/80"
                style={{
                  top: `${crosshairPosition.y * 100}%`,
                  width: `calc(${crosshairPosition.x * 100}% - 12px)`,
                }}
              />
              <div
                className="absolute right-0 h-px bg-primary/80"
                style={{
                  left: `calc(${crosshairPosition.x * 100}% + 12px)`,
                  top: `${crosshairPosition.y * 100}%`,
                }}
              />
            </div>
          ) : null}
          {activeTool === "hu" ? (
            <div
              className="absolute inset-0 z-30 cursor-crosshair"
              onPointerDown={(event) => handleHuPointerDown(event, config.id)}
              onPointerMove={(event) => handleHuPointerMove(event, config.id)}
            />
          ) : null}
          {huCircleDraft?.viewportId === config.id
            ? (() => {
                const radius = Math.max(2, getHuCircleRadius(huCircleDraft));
                const annotationPosition = getHuAnnotationPosition(
                  huCircleDraft,
                  viewportElementsRef.current[config.id],
                );
                const annotationLines = getHuAnnotationLines(huCircleDraft, huResult, isHuLoading);

                return (
                  <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
                    <svg className="absolute inset-0 h-full w-full">
                      <circle
                        cx={huCircleDraft.centerCanvas.x}
                        cy={huCircleDraft.centerCanvas.y}
                        fill="rgba(250, 204, 21, 0.12)"
                        r={radius}
                        stroke="rgb(250, 204, 21)"
                        strokeWidth="2"
                      />
                      <circle
                        cx={huCircleDraft.centerCanvas.x}
                        cy={huCircleDraft.centerCanvas.y}
                        fill="rgb(250, 204, 21)"
                        r="3"
                      />
                    </svg>
                    <div
                      className="absolute rounded border bg-black/75 px-2 py-1 text-[11px] font-medium leading-relaxed shadow-lg"
                      style={{
                        borderColor: "rgba(250, 204, 21, 0.8)",
                        color: "rgb(254, 240, 138)",
                        left: `${annotationPosition.left}px`,
                        top: `${annotationPosition.top}px`,
                        width: "168px",
                      }}
                    >
                      {annotationLines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>
      ))}

      {segmentationUrl && maskOverlayStatus !== "idle" ? (
        <div
          className={cn(
            "absolute right-3 top-3 z-10 max-w-xs rounded bg-black/70 px-2 py-1 text-xs font-medium text-text-soft",
            maskOverlayStatus === "unavailable" && "text-quaternary-100",
          )}
        >
          {maskOverlayStatus === "loading" ? "Chargement overlay masque" : null}
          {maskOverlayStatus === "active" ? "Overlay masque actif" : null}
          {maskOverlayStatus === "hidden" ? "Overlay masque masqué" : null}
          {maskOverlayStatus === "unavailable" ? "Overlay masque indisponible" : null}
        </div>
      ) : null}

      {toolMessage ? (
        <div className="absolute left-3 top-3 z-10 max-w-xs rounded bg-black/70 px-2 py-1 text-xs font-medium text-text-soft">
          {toolMessage}
        </div>
      ) : null}

      {shouldShowLoading ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-viewer">
          <div className="rounded-xl border border-border-soft bg-surface p-6 shadow-xl">
            <LoadingState label="Chargement Cornerstone3D" />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="absolute bottom-4 left-4 z-30 max-w-xl rounded-lg border border-quaternary-700 bg-surface p-3 text-sm text-quaternary-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}

export function CornerstoneVolumeViewer({
  actionRequest,
  activeTool = "crosshair",
  className,
  crosshairTarget,
  isMaskVisible = true,
  maskLabels = [],
  maskOpacity = 0.6,
  onActiveToolChange,
  onHuMeasurementChange,
  onMaskOverlayStatusChange,
  segmentationUrl,
  source,
  studyId,
}: CornerstoneVolumeViewerProps) {
  const reactId = useId().replace(/:/g, "");
  const sourceKey = useMemo(() => getSourceKey(source), [source]);
  const segmentationKey = useMemo(
    () => (segmentationUrl ? `seg-${segmentationUrl}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) : "no-seg"),
    [segmentationUrl],
  );
  const [activeViewerMode, setActiveViewerMode] = useState<ViewerMode>("mpr");
  const [activePreset, setActivePreset] = useState<WindowPresetId>("soft");
  const [clearTemporaryKey, setClearTemporaryKey] = useState(0);
  const renderingEngineId = `hekia-volume-rendering-engine-${reactId}-${sourceKey}`;
  const toolGroupId = `${cornerstoneToolGroupId}-volume-${reactId}-${sourceKey}`;
  const baseViewportId = `hekia-volume-viewport-${reactId}-${sourceKey}`;
  const volumeId = `cornerstoneStreamingImageVolume:hekia-volume-${reactId}-${sourceKey}`;
  const segmentationId = `hekia-segmentation-${reactId}-${segmentationKey}`;
  const segmentationVolumeId = `cornerstoneStreamingImageVolume:hekia-segmentation-volume-${reactId}-${segmentationKey}`;
  const activeLayout: VolumeLayout = activeViewerMode === "volume3d" ? "mpr" : activeViewerMode;

  const handleViewerModeChange = (nextMode: ViewerMode) => {
    const previousMode = activeViewerMode;

    setClearTemporaryKey((value) => value + 1);
    onHuMeasurementChange?.({ status: "idle" });
    setActiveViewerMode(nextMode);

    if (nextMode === "volume3d" || previousMode === "volume3d") {
      onActiveToolChange?.("crosshair");
    }
  };

  const handleBackToMpr = () => {
    handleViewerModeChange("mpr");
    onActiveToolChange?.("crosshair");
  };

  return (
    <div className={cn("flex h-full flex-col bg-viewer", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft bg-surface-100 p-2">
        <Toolbar className="gap-1 border-0 bg-transparent">
          {(["mpr", "axial", "sagittal", "coronal", "volume3d"] as ViewerMode[]).map((mode) => (
            <Button
              className="h-8"
              key={mode}
              onClick={() => handleViewerModeChange(mode)}
              size="sm"
              variant={activeViewerMode === mode ? "primary" : "ghost"}
            >
              {mode === "volume3d" ? "3D" : mode.toUpperCase()}
            </Button>
          ))}
        </Toolbar>

        {activeViewerMode !== "volume3d" ? (
          <Toolbar className="gap-1 border-0 bg-transparent">
            {windowPresets.map((preset) => (
              <Button
                className="h-8"
                key={preset.id}
                onClick={() => setActivePreset(preset.id)}
                size="sm"
                variant={activePreset === preset.id ? "primary" : "ghost"}
              >
                {preset.label}
              </Button>
            ))}
          </Toolbar>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        <div
          className={cn(
            "absolute inset-0 gap-1 bg-black p-1",
            getGridClassName(activeLayout),
            activeViewerMode === "volume3d" && "invisible pointer-events-none",
          )}
        >
          <VolumeRenderingArea
            activePreset={activePreset}
            activeTool={activeTool}
            actionRequest={activeViewerMode === "volume3d" ? null : actionRequest}
            baseViewportId={baseViewportId}
            clearTemporaryKey={clearTemporaryKey}
            crosshairTarget={crosshairTarget}
            isMaskVisible={isMaskVisible}
            layout={activeLayout}
            maskLabels={maskLabels}
            maskOpacity={maskOpacity}
            onActiveToolChange={onActiveToolChange}
            onHuMeasurementChange={onHuMeasurementChange}
            onMaskOverlayStatusChange={onMaskOverlayStatusChange}
            onPresetChange={setActivePreset}
            renderingEngineId={renderingEngineId}
            segmentationId={segmentationId}
            segmentationUrl={segmentationUrl}
            segmentationVolumeId={segmentationVolumeId}
            source={source}
            studyId={studyId}
            toolGroupId={toolGroupId}
            volumeId={volumeId}
          />
        </div>

        {activeViewerMode === "volume3d" ? (
          <div className="absolute inset-0">
            <VTKVolume3DViewer
              className="h-full w-full"
              onBackToMpr={handleBackToMpr}
              source={source}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
