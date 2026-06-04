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
  cache,
  Enums,
  RenderingEngine,
  setVolumesForViewports,
  utilities as cornerstoneUtilities,
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
import { SliceScrollBar } from "../SliceScrollBar";
import {
  getViewportGridItemClassName,
  ViewportFrame,
  ViewportGrid,
} from "../ViewportGrid";
import type {
  CornerstoneViewerSource,
  HuMeasurementPanelState,
  MaskOverlayStatus,
  ViewerActionRequest,
  ViewerCrosshairTarget,
  ViewerLayoutMode,
  ViewerTool,
  WindowPresetId,
} from "../CornerstoneViewer";
import type { MaskLabelState } from "../MaskLabelsPanel";
import { LoadingState } from "~/components/LoadingState";
import { Toolbar } from "~/components/Toolbar";
import {
  cornerstoneToolGroupId,
  createNiftiImageIds,
  initCornerstone,
  releaseDecompressedNiftiUrl,
} from "~/helpers/Cornerstone";
import { cn } from "~/helpers/Cn";
import type {
  HuCircleMeasurement,
  MeasurementPlane,
} from "~/types/Measurements";

type ViewerMode = ViewerLayoutMode;
type VolumeLayout = Exclude<ViewerLayoutMode, "volume3d">;
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

type VoxelPoint = {
  i: number;
  j: number;
  k: number;
};

type SliceIndexByPlane = Record<MprViewportKey, number>;

type MprState = {
  activePlane: MprViewportKey;
  crosshairVoxel: VoxelPoint;
  isDraggingCrosshair: boolean;
  sliceIndexByPlane: SliceIndexByPlane;
};

type ViewportProbeState = {
  hu: number | null;
  voxel: VoxelPoint | null;
  world: number[] | null;
};

type OrientationLabelSet = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

type CanvasPoint = {
  x: number;
  y: number;
};

type CanvasWorldViewport = Types.IViewport & {
  canvasToWorld?: (canvasPos: Types.Point2) => Types.Point3;
  getZoom?: () => number;
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
  showControls?: boolean;
  segmentationUrl?: string | null;
  viewerMode?: ViewerLayoutMode;
  windowPreset?: WindowPresetId;
  onActiveToolChange?: (tool: ViewerTool) => void;
  onHuMeasurementChange?: (state: HuMeasurementPanelState) => void;
  onMaskOverlayStatusChange?: (status: MaskOverlayStatus) => void;
  onViewerModeChange?: (mode: ViewerLayoutMode) => void;
  onWindowPresetChange?: (preset: WindowPresetId) => void;
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
  onViewportDoubleClick?: (viewportKey: MprViewportKey) => void;
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
    width: 1500,
    level: 300,
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

function getDisplayVoiRange(
  preset: WindowPreset,
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
) {
  const sourceType = source.metadata?.source_type?.toLowerCase();
  const rawLevelOffset = sourceType === "dicom" ? 1024 : 0;
  const halfWidth = preset.width / 2;
  const displayLevel = preset.level + rawLevelOffset;

  return {
    lower: displayLevel - halfWidth,
    upper: displayLevel + halfWidth,
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

function getSourceKey(source: Extract<CornerstoneViewerSource, { type: "nifti" }>) {
  return `nifti-${source.url}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

function getPreset(presetId: WindowPresetId) {
  return windowPresets.find((item) => item.id === presetId) || windowPresets[0];
}

function getSliceTotal(
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
  viewportKey: MprViewportKey,
) {
  const shape = source.metadata?.shape || [];
  const totalByViewport: Record<MprViewportKey, number> = {
    axial: shape[2] || 1,
    coronal: shape[1] || 1,
    sagittal: shape[0] || 1,
  };

  return Math.max(1, totalByViewport[viewportKey]);
}

function getInitialSliceIndices(source: Extract<CornerstoneViewerSource, { type: "nifti" }>) {
  return {
    axial: Math.floor(getSliceTotal(source, "axial") / 2),
    coronal: Math.floor(getSliceTotal(source, "coronal") / 2),
    sagittal: Math.floor(getSliceTotal(source, "sagittal") / 2),
  };
}

function getVolumeShape(source: Extract<CornerstoneViewerSource, { type: "nifti" }>) {
  const shape = source.metadata?.shape || [];

  return {
    i: Math.max(1, shape[0] || 1),
    j: Math.max(1, shape[1] || 1),
    k: Math.max(1, shape[2] || 1),
  };
}

function getVoxelFromSliceIndices(sliceIndices: SliceIndexByPlane): VoxelPoint {
  return {
    i: sliceIndices.sagittal,
    j: sliceIndices.coronal,
    k: sliceIndices.axial,
  };
}

function getSliceIndicesFromVoxel(voxel: VoxelPoint): SliceIndexByPlane {
  return {
    axial: Math.round(voxel.k),
    coronal: Math.round(voxel.j),
    sagittal: Math.round(voxel.i),
  };
}

function clampVoxelPoint(
  voxel: VoxelPoint,
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
): VoxelPoint {
  const shape = getVolumeShape(source);

  return {
    i: clampSliceIndex(Math.round(voxel.i), shape.i),
    j: clampSliceIndex(Math.round(voxel.j), shape.j),
    k: clampSliceIndex(Math.round(voxel.k), shape.k),
  };
}

function createInitialMprState(
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
): MprState {
  const sliceIndexByPlane = getInitialSliceIndices(source);

  return {
    activePlane: "axial",
    crosshairVoxel: getVoxelFromSliceIndices(sliceIndexByPlane),
    isDraggingCrosshair: false,
    sliceIndexByPlane,
  };
}

function clampSliceIndex(value: number, total: number) {
  return Math.max(0, Math.min(Math.max(0, total - 1), value));
}

function getViewportDimensions(
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
  viewportKey: MprViewportKey,
) {
  const shape = source.metadata?.shape || [];

  if (viewportKey === "axial") {
    return shape[0] && shape[1] ? `${shape[0]} x ${shape[1]}` : undefined;
  }

  if (viewportKey === "sagittal") {
    return shape[1] && shape[2] ? `${shape[1]} x ${shape[2]}` : undefined;
  }

  return shape[0] && shape[2] ? `${shape[0]} x ${shape[2]}` : undefined;
}

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  return value.toFixed(digits);
}

function formatVoxel(voxel: VoxelPoint | null) {
  if (!voxel) {
    return "-";
  }

  return `${Math.round(voxel.i)}, ${Math.round(voxel.j)}, ${Math.round(voxel.k)}`;
}

function formatWorld(world: number[] | null) {
  if (!world || world.length < 3) {
    return "-";
  }

  return `${formatNumber(world[0])}, ${formatNumber(world[1])}, ${formatNumber(world[2])}`;
}

function formatSpacing(source: Extract<CornerstoneViewerSource, { type: "nifti" }>) {
  const spacing = source.metadata?.spacing;

  if (!spacing?.length) {
    return undefined;
  }

  return spacing
    .slice(0, 3)
    .map((value) => `${formatNumber(value, 2)} mm`)
    .join(" x ");
}

function getPresetOverlayLabel(presetId: WindowPresetId) {
  const preset = getPreset(presetId);

  return `${preset.id.toUpperCase()} ${preset.level} / ${preset.width}`;
}

function getClinicalHuValue(
  value: number,
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
) {
  const sourceType = source.metadata?.source_type?.toLowerCase();

  if (sourceType === "dicom") {
    return value - 1024;
  }

  return value;
}

function readVoxelHu(
  voxel: VoxelPoint,
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
  volumeId: string,
) {
  const volume = cache.getVolume(volumeId);
  const voxelManager = volume?.voxelManager;

  if (!voxelManager?.getAtIJKPoint) {
    return null;
  }

  try {
    const value = voxelManager.getAtIJKPoint([
      Math.round(voxel.i),
      Math.round(voxel.j),
      Math.round(voxel.k),
    ]);

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }

    return Math.round(getClinicalHuValue(value, source));
  } catch {
    return null;
  }
}

function getSliceLabel(sliceIndex: number, total: number) {
  return `${clampSliceIndex(sliceIndex, total) + 1}/${Math.max(1, total)}`;
}

function getOrientationLabels(viewportKey: MprViewportKey): OrientationLabelSet {
  // Fallback convention for the current canonical LPS CT volumes. The affine is
  // retained for future true orientation derivation once non-canonical inputs are validated.
  if (viewportKey === "axial") {
    return { bottom: "P", left: "R", right: "L", top: "A" };
  }

  if (viewportKey === "sagittal") {
    return { bottom: "F", left: "P", right: "A", top: "H" };
  }

  return { bottom: "F", left: "R", right: "L", top: "H" };
}

function getVoxelCrosshairPosition(
  voxel: VoxelPoint,
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
  viewportKey: MprViewportKey,
): CrosshairPosition {
  const shape = getVolumeShape(source);

  if (viewportKey === "axial") {
    return {
      x: clamp(voxel.i / Math.max(1, shape.i - 1)),
      y: clamp(voxel.j / Math.max(1, shape.j - 1)),
    };
  }

  if (viewportKey === "sagittal") {
    return {
      x: clamp(voxel.j / Math.max(1, shape.j - 1)),
      y: clamp(voxel.k / Math.max(1, shape.k - 1)),
    };
  }

  return {
    x: clamp(voxel.i / Math.max(1, shape.i - 1)),
    y: clamp(voxel.k / Math.max(1, shape.k - 1)),
  };
}

function getFallbackAffine(source: Extract<CornerstoneViewerSource, { type: "nifti" }>) {
  const origin = source.metadata?.origin || [0, 0, 0];
  const spacing = source.metadata?.spacing || [1, 1, 1];
  const direction = source.metadata?.direction || [1, 0, 0, 0, 1, 0, 0, 0, 1];

  return [
    [
      (direction[0] || 0) * (spacing[0] || 1),
      (direction[1] || 0) * (spacing[1] || 1),
      (direction[2] || 0) * (spacing[2] || 1),
      origin[0] || 0,
    ],
    [
      (direction[3] || 0) * (spacing[0] || 1),
      (direction[4] || 0) * (spacing[1] || 1),
      (direction[5] || 0) * (spacing[2] || 1),
      origin[1] || 0,
    ],
    [
      (direction[6] || 0) * (spacing[0] || 1),
      (direction[7] || 0) * (spacing[1] || 1),
      (direction[8] || 0) * (spacing[2] || 1),
      origin[2] || 0,
    ],
  ];
}

function getVolumeAffine(source: Extract<CornerstoneViewerSource, { type: "nifti" }>) {
  const affine = source.metadata?.affine;

  if (
    affine &&
    affine.length >= 3 &&
    affine[0]?.length >= 4 &&
    affine[1]?.length >= 4 &&
    affine[2]?.length >= 4
  ) {
    return affine;
  }

  return getFallbackAffine(source);
}

function invert3x3(matrix: number[][]) {
  const a = matrix[0]?.[0] || 0;
  const b = matrix[0]?.[1] || 0;
  const c = matrix[0]?.[2] || 0;
  const d = matrix[1]?.[0] || 0;
  const e = matrix[1]?.[1] || 0;
  const f = matrix[1]?.[2] || 0;
  const g = matrix[2]?.[0] || 0;
  const h = matrix[2]?.[1] || 0;
  const i = matrix[2]?.[2] || 0;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  if (!determinant) {
    return null;
  }

  const invDet = 1 / determinant;

  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

function voxelToWorld(
  voxel: VoxelPoint,
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
): Types.Point3 {
  const affine = getVolumeAffine(source);
  const values = [voxel.i, voxel.j, voxel.k];

  return [0, 1, 2].map((row) => {
    const affineRow = affine[row] || [];

    return (
      (affineRow[0] || 0) * values[0] +
      (affineRow[1] || 0) * values[1] +
      (affineRow[2] || 0) * values[2] +
      (affineRow[3] || 0)
    );
  }) as Types.Point3;
}

function worldToVoxel(
  world: number[],
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
): VoxelPoint | null {
  const affine = getVolumeAffine(source);
  const inverse = invert3x3([
    [affine[0]?.[0] || 0, affine[0]?.[1] || 0, affine[0]?.[2] || 0],
    [affine[1]?.[0] || 0, affine[1]?.[1] || 0, affine[1]?.[2] || 0],
    [affine[2]?.[0] || 0, affine[2]?.[1] || 0, affine[2]?.[2] || 0],
  ]);

  if (!inverse) {
    return null;
  }

  const translated = [
    world[0] - (affine[0]?.[3] || 0),
    world[1] - (affine[1]?.[3] || 0),
    world[2] - (affine[2]?.[3] || 0),
  ];

  return {
    i: inverse[0][0] * translated[0] + inverse[0][1] * translated[1] + inverse[0][2] * translated[2],
    j: inverse[1][0] * translated[0] + inverse[1][1] * translated[1] + inverse[1][2] * translated[2],
    k: inverse[2][0] * translated[0] + inverse[2][1] * translated[1] + inverse[2][2] * translated[2],
  };
}

function applyWindowPreset(
  viewports: Types.IViewport[],
  presetId: WindowPresetId,
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>,
) {
  const preset = getPreset(presetId);

  viewports.forEach((viewport) => {
    const voiViewport = viewport as VoiViewport;

    if (!voiViewport.setProperties) {
      return;
    }

    voiViewport.setProperties({
      voiRange: getDisplayVoiRange(preset, source),
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

function parseMaskLabelColor(color: string): [number, number, number] | null {
  const normalizedColor = color.trim();
  const hexMatch = normalizedColor.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hexMatch) {
    const hex = hexMatch[1];
    const expandedHex =
      hex.length === 3
        ? hex
            .split("")
            .map((channel) => `${channel}${channel}`)
            .join("")
        : hex;

    return [
      Number.parseInt(expandedHex.slice(0, 2), 16),
      Number.parseInt(expandedHex.slice(2, 4), 16),
      Number.parseInt(expandedHex.slice(4, 6), 16),
    ];
  }

  const rgbMatch = normalizedColor.match(/^rgba?\(([^)]+)\)$/i);

  if (!rgbMatch) {
    return null;
  }

  const channels = rgbMatch[1]
    .split(",")
    .slice(0, 3)
    .map((channel) => Number.parseFloat(channel.trim()));

  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    return null;
  }

  return channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel)))) as [
    number,
    number,
    number,
  ];
}

function createMaskColorLUT(maskLabels: MaskLabelState[] = []): Types.ColorLUT {
  const maxLabelId = Math.max(
    255,
    ...maskLabels.map((label) => (Number.isFinite(label.labelId) ? label.labelId : 0)),
  );
  const lut: Types.ColorLUT = [[0, 0, 0, 0]];

  for (let index = 1; index <= maxLabelId; index += 1) {
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

  maskLabels.forEach((label) => {
    if (!Number.isFinite(label.labelId) || label.labelId <= 0) {
      return;
    }

    const parsedColor = parseMaskLabelColor(label.color);

    if (!parsedColor) {
      return;
    }

    lut[label.labelId] = [...parsedColor, 190];
  });

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

function removeCachedVolumeQuietly(volumeId: string) {
  try {
    if (cache.getVolume(volumeId) || cache.getVolumeLoadObject(volumeId)) {
      cache.removeVolumeLoadObject(volumeId);
    }
  } catch {
    // Cache entries may already be gone while a study is switching.
  }
}

function disposeStudyResources({
  renderingEngine,
  segmentationId,
  segmentationVolumeId,
  segmentationUrl,
  sourceUrl,
  toolGroupId,
  volumeId,
}: {
  renderingEngine: RenderingEngine | null;
  segmentationId: string;
  segmentationVolumeId: string;
  segmentationUrl?: string | null;
  sourceUrl: string;
  toolGroupId: string;
  volumeId: string;
}) {
  removeSegmentationQuietly(segmentationId);

  try {
    ToolGroupManager.destroyToolGroup(toolGroupId);
  } catch {
    // ToolGroup can already be destroyed by Cornerstone internals.
  }

  try {
    renderingEngine?.destroy();
  } catch {
    // Destroy may race with route switches.
  }

  removeCachedVolumeQuietly(segmentationVolumeId);
  removeCachedVolumeQuietly(volumeId);
  releaseDecompressedNiftiUrl(sourceUrl);

  if (segmentationUrl) {
    releaseDecompressedNiftiUrl(segmentationUrl);
  }

  if (import.meta.env.DEV) {
    console.debug("[Cornerstone cleanup]", {
      segmentationId,
      segmentationVolumeId,
      toolGroupId,
      volumeId,
    });
  }
}

function CrosshairOverlay({
  isDragging,
  position,
}: {
  isDragging: boolean;
  position: CrosshairPosition;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className={cn(
          "absolute top-0 w-px bg-cyan-300/75 shadow-[0_0_6px_rgba(34,211,238,0.25)]",
          isDragging && "bg-cyan-200",
        )}
        style={{
          height: `calc(${position.y * 100}% - 10px)`,
          left: `${position.x * 100}%`,
        }}
      />
      <div
        className={cn(
          "absolute bottom-0 w-px bg-cyan-300/75 shadow-[0_0_6px_rgba(34,211,238,0.25)]",
          isDragging && "bg-cyan-200",
        )}
        style={{
          left: `${position.x * 100}%`,
          top: `calc(${position.y * 100}% + 10px)`,
        }}
      />
      <div
        className={cn(
          "absolute left-0 h-px bg-cyan-300/75 shadow-[0_0_6px_rgba(34,211,238,0.25)]",
          isDragging && "bg-cyan-200",
        )}
        style={{
          top: `${position.y * 100}%`,
          width: `calc(${position.x * 100}% - 10px)`,
        }}
      />
      <div
        className={cn(
          "absolute right-0 h-px bg-cyan-300/75 shadow-[0_0_6px_rgba(34,211,238,0.25)]",
          isDragging && "bg-cyan-200",
        )}
        style={{
          left: `calc(${position.x * 100}% + 10px)`,
          top: `${position.y * 100}%`,
        }}
      />
      <div
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/90 bg-black/40"
        style={{
          left: `${position.x * 100}%`,
          top: `${position.y * 100}%`,
        }}
      />
    </div>
  );
}

function OrientationLabels({ labels }: { labels: OrientationLabelSet }) {
  const baseClass =
    "pointer-events-none absolute z-20 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-cyan-100/90";

  return (
    <>
      <span className={cn(baseClass, "left-1/2 top-1 -translate-x-1/2")}>{labels.top}</span>
      <span className={cn(baseClass, "bottom-1 left-1/2 -translate-x-1/2")}>
        {labels.bottom}
      </span>
      <span className={cn(baseClass, "left-1 top-1/2 -translate-y-1/2")}>{labels.left}</span>
      <span className={cn(baseClass, "right-1 top-1/2 -translate-y-1/2")}>
        {labels.right}
      </span>
    </>
  );
}

function ViewportInfoOverlay({
  dimensions,
  isActive,
  plane,
  presetLabel,
  probe,
  segmentationStatus,
  sliceLabel,
  spacingLabel,
  zoomLabel,
}: {
  dimensions?: string;
  isActive: boolean;
  plane: string;
  presetLabel: string;
  probe: ViewportProbeState | null;
  segmentationStatus?: string;
  sliceLabel: string;
  spacingLabel?: string;
  zoomLabel?: string;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-[10px] leading-4 text-text-muted">
      <div className="absolute left-2 top-2 max-w-[45%] rounded bg-black/60 px-2 py-1">
        <p className="text-[11px] font-semibold text-text">
          {plane}
          {isActive ? <span className="ml-2 text-cyan-200">ACTIF</span> : null}
        </p>
        <p>Slice {sliceLabel}</p>
        <p>WL {presetLabel}</p>
      </div>

      <div className="absolute right-11 top-2 hidden max-w-[42%] rounded bg-black/60 px-2 py-1 text-right xl:block">
        {dimensions ? <p>{dimensions}</p> : null}
        {spacingLabel ? <p>{spacingLabel}</p> : null}
        {zoomLabel ? <p>{zoomLabel}</p> : null}
        {segmentationStatus ? <p>{segmentationStatus}</p> : null}
      </div>

      <div className="absolute bottom-2 left-2 max-w-[58%] rounded bg-black/60 px-2 py-1">
        <p>Voxel {formatVoxel(probe?.voxel || null)}</p>
        <p>World {formatWorld(probe?.world || null)}</p>
        <p>HU {probe?.hu == null ? "-" : probe.hu}</p>
      </div>
    </div>
  );
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
  onViewportDoubleClick,
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
  const [activeViewportId, setActiveViewportId] = useState<string | null>(null);
  const [mprState, setMprState] = useState(() => createInitialMprState(source));
  const [huCircleDraft, setHuCircleDraft] = useState<HuCircleDraft | null>(null);
  const [huResult, setHuResult] = useState<HuCircleMeasurement | null>(null);
  const [isHuLoading, setIsHuLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [maskOverlayStatus, setMaskOverlayStatus] = useState<MaskOverlayStatus>("idle");
  const [probeByViewportId, setProbeByViewportId] = useState<
    Record<string, ViewportProbeState | null>
  >({});
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const viewportConfigs = useMemo(() => getViewportConfigs(baseViewportId), [baseViewportId]);
  const viewportIds = useMemo(
    () => viewportConfigs.map((config) => config.id),
    [viewportConfigs],
  );
  const sliceTotals = useMemo(
    () => ({
      axial: getSliceTotal(source, "axial"),
      coronal: getSliceTotal(source, "coronal"),
      sagittal: getSliceTotal(source, "sagittal"),
    }),
    [source],
  );
  const sliceIndices = mprState.sliceIndexByPlane;
  const crosshairWorld = useMemo(
    () => voxelToWorld(mprState.crosshairVoxel, source),
    [mprState.crosshairVoxel, source],
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

  const setActiveViewport = useCallback((viewportId: string) => {
    const viewportKey = getPlaneByViewportId(viewportId, viewportConfigs);

    activeViewportIdRef.current = viewportId;
    setActiveViewportId(viewportId);

    if (viewportKey) {
      setMprState((currentState) => ({
        ...currentState,
        activePlane: viewportKey,
      }));
    }
  }, [viewportConfigs]);

  const setViewportElement = useCallback((id: string, element: HTMLDivElement | null) => {
    viewportElementsRef.current[id] = element;

    if (element && !activeViewportIdRef.current) {
      activeViewportIdRef.current = id;
      setActiveViewportId(id);
    }
  }, []);

  const syncMprViewportsToCrosshair = useCallback(
    (sliceIndexByPlane: SliceIndexByPlane) => {
      if (!isRenderingReadyRef.current) {
        return;
      }

      viewportConfigs.forEach((config) => {
        const element = viewportElementsRef.current[config.id];

        if (!element) {
          return;
        }

        void cornerstoneUtilities
          .jumpToSlice(element, {
            debounceLoading: true,
            imageIndex: sliceIndexByPlane[config.key],
            volumeId,
          })
          .then(() => {
            viewportsByIdRef.current[config.id]?.render();
          })
          .catch((syncError) => {
            if (import.meta.env.DEV) {
              console.warn("[Cornerstone MPR sync]", syncError);
            }
          });
      });

      renderingEngineRef.current?.renderViewports(viewportIds);
    },
    [viewportConfigs, viewportIds, volumeId],
  );

  const applyMprVoxel = useCallback(
    (voxel: VoxelPoint) => {
      const nextVoxel = clampVoxelPoint(voxel, source);
      const nextSliceIndexByPlane = getSliceIndicesFromVoxel(nextVoxel);

      setMprState((currentState) => ({
        ...currentState,
        crosshairVoxel: nextVoxel,
        sliceIndexByPlane: nextSliceIndexByPlane,
      }));
      syncMprViewportsToCrosshair(nextSliceIndexByPlane);
      clearHuMeasurement();
      setToolMessage(null);
    },
    [clearHuMeasurement, source, syncMprViewportsToCrosshair],
  );

  const getViewportClickVoxel = useCallback(
    (event: PointerEvent<HTMLElement>, viewportId: string): VoxelPoint | null => {
      const point = getCanvasPointerPosition(event, viewportElementsRef.current[viewportId]);
      const viewport =
        viewportsByIdRef.current[viewportId] || renderingEngineRef.current?.getViewport(viewportId);

      if (point) {
        const worldPoint = getWorldPoint(viewport, point);
        const voxelPoint = worldPoint ? worldToVoxel(worldPoint, source) : null;

        if (voxelPoint) {
          return clampVoxelPoint(voxelPoint, source);
        }
      }

      const position = getRelativePointerPosition(event, viewportElementsRef.current[viewportId]);
      const viewportKey = getPlaneByViewportId(viewportId, viewportConfigs);

      if (!position || !viewportKey) {
        return null;
      }

      const shape = getVolumeShape(source);
      const currentVoxel = mprState.crosshairVoxel;

      if (viewportKey === "axial") {
        return clampVoxelPoint(
          {
            i: position.x * (shape.i - 1),
            j: position.y * (shape.j - 1),
            k: currentVoxel.k,
          },
          source,
        );
      }

      if (viewportKey === "sagittal") {
        return clampVoxelPoint(
          {
            i: currentVoxel.i,
            j: position.x * (shape.j - 1),
            k: position.y * (shape.k - 1),
          },
          source,
        );
      }

      return clampVoxelPoint(
        {
          i: position.x * (shape.i - 1),
          j: currentVoxel.j,
          k: position.y * (shape.k - 1),
        },
        source,
      );
    },
    [mprState.crosshairVoxel, source, viewportConfigs],
  );

  const getViewportProbe = useCallback(
    (event: PointerEvent<HTMLElement>, viewportId: string): ViewportProbeState | null => {
      const point = getCanvasPointerPosition(event, viewportElementsRef.current[viewportId]);
      const viewport =
        viewportsByIdRef.current[viewportId] || renderingEngineRef.current?.getViewport(viewportId);

      if (!point) {
        return null;
      }

      const world = getWorldPoint(viewport, point);
      const voxel = world ? worldToVoxel(world, source) : null;

      if (!voxel) {
        return {
          hu: null,
          voxel: null,
          world,
        };
      }

      const clampedVoxel = clampVoxelPoint(voxel, source);

      return {
        hu: readVoxelHu(clampedVoxel, source, volumeId),
        voxel: clampedVoxel,
        world,
      };
    },
    [source, volumeId],
  );

  const updateViewportProbe = useCallback(
    (event: PointerEvent<HTMLElement>, viewportId: string) => {
      const probe = getViewportProbe(event, viewportId);

      setProbeByViewportId((currentState) => ({
        ...currentState,
        [viewportId]: probe,
      }));
    },
    [getViewportProbe],
  );

  const setSliceForViewport = useCallback(
    (viewportId: string, nextSliceIndex: number) => {
      const viewportKey = getPlaneByViewportId(viewportId, viewportConfigs);

      if (!viewportKey) {
        return;
      }

      const nextVoxel = { ...mprState.crosshairVoxel };
      const clampedSliceIndex = clampSliceIndex(nextSliceIndex, sliceTotals[viewportKey]);

      if (viewportKey === "axial") {
        nextVoxel.k = clampedSliceIndex;
      } else if (viewportKey === "sagittal") {
        nextVoxel.i = clampedSliceIndex;
      } else {
        nextVoxel.j = clampedSliceIndex;
      }

      applyMprVoxel(nextVoxel);
    },
    [applyMprVoxel, mprState.crosshairVoxel, sliceTotals, viewportConfigs],
  );

  const handleViewportWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>, viewportId: string) => {
      const delta = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;

      if (!delta || isLoading || !isSceneReady) {
        return;
      }

      const viewportKey = getPlaneByViewportId(viewportId, viewportConfigs);

      if (!viewportKey) {
        return;
      }

      event.preventDefault();
      setActiveViewport(viewportId);
      setSliceForViewport(viewportId, sliceIndices[viewportKey] + delta);
    },
    [
      isLoading,
      isSceneReady,
      setActiveViewport,
      setSliceForViewport,
      sliceIndices,
      viewportConfigs,
    ],
  );

  const handleSliceScrollChange = useCallback(
    (viewportId: string, nextSliceIndex: number) => {
      if (isLoading || !isSceneReady) {
        return;
      }
      setActiveViewport(viewportId);
      setSliceForViewport(viewportId, nextSliceIndex);
    },
    [isLoading, isSceneReady, setActiveViewport, setSliceForViewport],
  );

  const updateCrosshairPositionFromEvent = useCallback(
    (event: PointerEvent<HTMLElement>, viewportId: string) => {
      if (isLoading || !isSceneReady) {
        return;
      }

      const voxel = getViewportClickVoxel(event, viewportId);

      if (!voxel) {
        return;
      }

      setActiveViewport(viewportId);
      applyMprVoxel(voxel);
    },
    [applyMprVoxel, getViewportClickVoxel, isLoading, isSceneReady, setActiveViewport],
  );

  const handleViewportPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      setActiveViewport(viewportId);
      updateViewportProbe(event, viewportId);

      if (activeToolRef.current === "hu") {
        return;
      }

      setMprState((currentState) => ({
        ...currentState,
        isDraggingCrosshair: true,
      }));
      updateCrosshairPositionFromEvent(event, viewportId);
    },
    [setActiveViewport, updateCrosshairPositionFromEvent, updateViewportProbe],
  );

  const handleViewportPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      updateViewportProbe(event, viewportId);

      if (activeToolRef.current === "hu" || event.buttons !== 1) {
        return;
      }

      setMprState((currentState) => ({
        ...currentState,
        isDraggingCrosshair: true,
      }));
      updateCrosshairPositionFromEvent(event, viewportId);
    },
    [updateCrosshairPositionFromEvent, updateViewportProbe],
  );

  const handleViewportPointerUp = useCallback(() => {
    setMprState((currentState) => ({
      ...currentState,
      isDraggingCrosshair: false,
    }));
  }, []);

  const handleViewportPointerLeave = useCallback(
    (viewportId: string) => {
      setMprState((currentState) => ({
        ...currentState,
        isDraggingCrosshair: false,
      }));
      setProbeByViewportId((currentState) => ({
        ...currentState,
        [viewportId]: null,
      }));
    },
    [],
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
      setActiveViewport(viewportId);
      setToolMessage(null);
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
    [finalizeHuCircle, onHuMeasurementChange, setActiveViewport, viewportConfigs],
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
        voiRange: getDisplayVoiRange(preset, source),
      });

      viewport.render();
    });

    const initialMprState = createInitialMprState(source);

    setMprState(initialMprState);
    syncMprViewportsToCrosshair(initialMprState.sliceIndexByPlane);
    clearHuMeasurement();
    setToolMessage(null);
    onPresetChange(preset.id);
    onActiveToolChange?.("crosshair");
  }, [
    clearHuMeasurement,
    onActiveToolChange,
    onPresetChange,
    source,
    syncMprViewportsToCrosshair,
  ]);

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
    applyWindowPreset(viewportsRef.current, activePreset, source);
  }, [activePreset, source]);

  useEffect(() => {
    const initialMprState = createInitialMprState(source);

    setMprState(initialMprState);
    setProbeByViewportId({});
    syncMprViewportsToCrosshair(initialMprState.sliceIndexByPlane);
  }, [source]);

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

    if (crosshairTarget.world?.length && crosshairTarget.world.length >= 3) {
      const voxel = worldToVoxel(crosshairTarget.world, source);

      if (voxel) {
        applyMprVoxel(voxel);
        return;
      }
    }

    if (crosshairTarget.voxel?.length && crosshairTarget.voxel.length >= 3) {
      applyMprVoxel({
        i: crosshairTarget.voxel[0],
        j: crosshairTarget.voxel[1],
        k: crosshairTarget.voxel[2],
      });
      return;
    }

    if (crosshairTarget.sliceIndices) {
      applyMprVoxel(
        getVoxelFromSliceIndices({
          ...sliceIndices,
          ...crosshairTarget.sliceIndices,
        }),
      );
      return;
    }

    const shape = getVolumeShape(source);

    applyMprVoxel({
      i: clamp(crosshairTarget.x) * (shape.i - 1),
      j: clamp(crosshairTarget.y) * (shape.j - 1),
      k: mprState.crosshairVoxel.k,
    });
  }, [applyMprVoxel, crosshairTarget, mprState.crosshairVoxel.k, sliceIndices, source]);

  useEffect(() => {
    const nextViewportId = getLayoutViewportId(layout, viewportConfigs);

    if (layout !== "mpr" || !activeViewportIdRef.current) {
      setActiveViewport(nextViewportId);
    }
  }, [layout, setActiveViewport, viewportConfigs]);

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
      removeSegmentationQuietly(segmentationId);

      try {
        ToolGroupManager.destroyToolGroup(toolGroupId);
      } catch {
        // ToolGroup may be absent during first mount.
      }

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
          disposeStudyResources({
            renderingEngine,
            segmentationId,
            segmentationVolumeId,
            segmentationUrl: null,
            sourceUrl: source.url,
            toolGroupId,
            volumeId,
          });
          renderingEngine = null;
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
        setActiveViewportId(viewportIds[0] || null);
        renderingEngineRef.current = renderingEngine;
        viewportsRef.current = nextViewports;
        viewportsByIdRef.current = Object.fromEntries(
          viewportIds.map((viewportId, index) => [viewportId, nextViewports[index]]),
        );
        isRenderingReadyRef.current = true;
        viewportInputs.forEach((input) => resizeObserver.observe(input.element));

        applyWindowPreset(nextViewports, activePresetRef.current, source);
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
        disposeStudyResources({
          renderingEngine,
          segmentationId,
          segmentationVolumeId,
          segmentationUrl: null,
          sourceUrl: source.url,
          toolGroupId,
          volumeId,
        });
        renderingEngine = null;
        renderingEngineRef.current = null;
        viewportsRef.current = [];
        viewportsByIdRef.current = {};
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
      disposeStudyResources({
        renderingEngine: renderingEngine || renderingEngineRef.current,
        segmentationId,
        segmentationVolumeId,
        segmentationUrl: null,
        sourceUrl: source.url,
        toolGroupId,
        volumeId,
      });
      renderingEngineRef.current = null;
      viewportsRef.current = [];
      viewportsByIdRef.current = {};
      updateMaskOverlayStatus("idle");
    };
  }, [
    renderingEngineId,
    segmentationId,
    segmentationVolumeId,
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
      removeCachedVolumeQuietly(segmentationVolumeId);
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
          removeCachedVolumeQuietly(segmentationVolumeId);
          releaseDecompressedNiftiUrl(currentSegmentationUrl);
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
                    colorLUTOrIndex: createMaskColorLUT(maskLabelsRef.current),
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
        removeCachedVolumeQuietly(segmentationVolumeId);
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
      removeCachedVolumeQuietly(segmentationVolumeId);
      releaseDecompressedNiftiUrl(currentSegmentationUrl);
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
  const getCrosshairPositionForViewport = useCallback(
    (config: ViewportConfig): CrosshairPosition => {
      const viewport = viewportsByIdRef.current[config.id] as CanvasWorldViewport | undefined;
      const element = viewportElementsRef.current[config.id];

      if (viewport?.worldToCanvas && element?.clientWidth && element.clientHeight) {
        try {
          const canvasPosition = viewport.worldToCanvas(crosshairWorld);

          if (
            Number.isFinite(canvasPosition[0]) &&
            Number.isFinite(canvasPosition[1])
          ) {
            return {
              x: clamp(canvasPosition[0] / element.clientWidth),
              y: clamp(canvasPosition[1] / element.clientHeight),
            };
          }
        } catch {
          // Fallback to voxel-normalized coordinates below.
        }
      }

      return getVoxelCrosshairPosition(mprState.crosshairVoxel, source, config.key);
    },
    [crosshairWorld, mprState.crosshairVoxel, source],
  );
  const getViewportZoomLabel = useCallback((viewportId: string) => {
    const viewport = viewportsByIdRef.current[viewportId] as CanvasWorldViewport | undefined;

    if (!viewport?.getZoom) {
      return undefined;
    }

    try {
      const zoom = viewport.getZoom();

      return Number.isFinite(zoom) ? `Zoom ${formatNumber(zoom, 2)}x` : undefined;
    } catch {
      return undefined;
    }
  }, []);
  const spacingLabel = formatSpacing(source);
  const presetOverlayLabel = getPresetOverlayLabel(activePreset);
  const activeViewportConfig =
    viewportConfigs.find((config) => config.id === activeViewportId) ||
    viewportConfigs.find((config) => config.id === activeViewportIdRef.current) ||
    viewportConfigs[0];
  const activeScrollerViewportId = activeViewportConfig?.id || viewportIds[0] || "";
  const activeScrollerKey = activeViewportConfig?.key || "axial";
  const activeScrollerSlice = sliceIndices[activeScrollerKey];
  const activeScrollerTotal = sliceTotals[activeScrollerKey];

  return (
    <div className="contents" ref={containerRef}>
      {viewportConfigs.map((config) => {
        const sliceTotal = sliceTotals[config.key];
        const sliceIndex = sliceIndices[config.key];
        const crosshairPosition = getCrosshairPositionForViewport(config);
        const isViewportActive = activeViewportId === config.id;
        const segmentationStatus =
          segmentationUrl && maskOverlayStatus !== "idle"
            ? `Seg ${maskOverlayStatus}`
            : undefined;
        const sliceLabel = getSliceLabel(sliceIndex, sliceTotal);

        return (
          <ViewportFrame
            className={getViewportGridItemClassName(layout, config.key)}
            isActive={isViewportActive}
            key={config.id}
            label={config.label}
            onDoubleClick={() => onViewportDoubleClick?.(config.key)}
            onMouseEnter={() => setActiveViewport(config.id)}
            onPointerDown={(event) => handleViewportPointerDown(event, config.id)}
            onPointerLeave={() => handleViewportPointerLeave(config.id)}
            onPointerMove={(event) => handleViewportPointerMove(event, config.id)}
            onPointerUp={handleViewportPointerUp}
            showDefaultOverlay={false}
          >
          <div
            className={cn(
              "h-full w-full",
              shouldShowLoading && "pointer-events-none",
            )}
            onWheel={(event) => handleViewportWheel(event, config.id)}
            ref={(element) => setViewportElement(config.id, element)}
          />
          {!shouldShowLoading ? (
            <>
              <ViewportInfoOverlay
                dimensions={getViewportDimensions(source, config.key)}
                isActive={isViewportActive}
                plane={config.label}
                presetLabel={presetOverlayLabel}
                probe={probeByViewportId[config.id] || null}
                segmentationStatus={segmentationStatus}
                sliceLabel={sliceLabel}
                spacingLabel={spacingLabel}
                zoomLabel={getViewportZoomLabel(config.id)}
              />
              <OrientationLabels labels={getOrientationLabels(config.key)} />
            </>
          ) : null}
          {!shouldShowLoading && activeTool === "crosshair" ? (
            <CrosshairOverlay
              isDragging={mprState.isDraggingCrosshair && isViewportActive}
              position={crosshairPosition}
            />
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
          </ViewportFrame>
        );
      })}

      {!shouldShowLoading && !error && activeScrollerViewportId ? (
        <div className="absolute bottom-4 right-4 top-16 z-30">
          <SliceScrollBar
            className="w-8 bg-black/70"
            current={activeScrollerSlice}
            onChange={(nextSliceIndex) =>
              handleSliceScrollChange(activeScrollerViewportId, nextSliceIndex)
            }
            total={activeScrollerTotal}
          />
        </div>
      ) : null}

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
  onViewerModeChange,
  onWindowPresetChange,
  segmentationUrl,
  showControls = true,
  source,
  studyId,
  viewerMode,
  windowPreset,
}: CornerstoneVolumeViewerProps) {
  const reactId = useId().replace(/:/g, "");
  const sourceKey = useMemo(() => getSourceKey(source), [source]);
  const segmentationKey = useMemo(
    () => (segmentationUrl ? `seg-${segmentationUrl}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120) : "no-seg"),
    [segmentationUrl],
  );
  const [internalViewerMode, setInternalViewerMode] = useState<ViewerMode>("mpr");
  const [internalPreset, setInternalPreset] = useState<WindowPresetId>("soft");
  const [clearTemporaryKey, setClearTemporaryKey] = useState(0);
  const activeViewerMode = viewerMode || internalViewerMode;
  const activePreset = windowPreset || internalPreset;
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
    setInternalViewerMode(nextMode);
    onViewerModeChange?.(nextMode);

    if (nextMode === "volume3d" || previousMode === "volume3d") {
      onActiveToolChange?.("crosshair");
    }
  };

  const handleWindowPresetChange = (nextPreset: WindowPresetId) => {
    setInternalPreset(nextPreset);
    onWindowPresetChange?.(nextPreset);
  };

  const handleBackToMpr = () => {
    handleViewerModeChange("mpr");
    onActiveToolChange?.("crosshair");
  };

  return (
    <div className={cn("flex h-full flex-col bg-viewer", className)}>
      {showControls ? (
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
                onClick={() => handleWindowPresetChange(preset.id)}
                size="sm"
                variant={activePreset === preset.id ? "primary" : "ghost"}
              >
                {preset.label}
              </Button>
            ))}
          </Toolbar>
        ) : null}
      </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-black">
        <ViewportGrid
          isHidden={activeViewerMode === "volume3d"}
          layout={activeLayout}
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
            onPresetChange={handleWindowPresetChange}
            onViewportDoubleClick={(viewportKey) => {
              handleViewerModeChange(activeViewerMode === viewportKey ? "mpr" : viewportKey);
            }}
            renderingEngineId={renderingEngineId}
            segmentationId={segmentationId}
            segmentationUrl={segmentationUrl}
            segmentationVolumeId={segmentationVolumeId}
            source={source}
            studyId={studyId}
            toolGroupId={toolGroupId}
            volumeId={volumeId}
          />
        </ViewportGrid>

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
