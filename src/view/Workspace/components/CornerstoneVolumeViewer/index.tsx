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
  imageLoader,
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

import { Button } from "~/components/Button";
import { MeasurementOverlay } from "../MeasurementOverlay";
import { VTKVolume3DViewer } from "../VTKVolume3DViewer";
import { SliceScrollBar } from "../SliceScrollBar";
import {
  getViewportGridItemClassName,
  ViewportFrame,
  ViewportGrid,
} from "../ViewportGrid";
import type {
  CornerstoneViewerSource,
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
import type { MeasurementPlane } from "~/types/Measurements";
import {
  calculateCircleRoiStats,
  getLengthMm,
  getPlaneRadiusMm,
  measurementPointToVoxel,
  toMeasurementPoint,
  voxelToMeasurementPoint,
} from "../../measurements/measurementGeometry";
import type {
  MeasurementDraft,
  MeasurementPoint,
  MedicalMeasurement,
} from "../../measurements/measurementTypes";

type ViewerMode = ViewerLayoutMode;
type VolumeLayout = Exclude<ViewerLayoutMode, "volume3d">;
type MprViewportKey = Exclude<VolumeLayout, "mpr">;
type CornerstoneToolGroup = NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>;
type VolumeViewerSource = Extract<CornerstoneViewerSource, { type: "nifti" | "dicom" }>;

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

type RotationDeg = 0 | 90 | 180 | 270;

type ViewportDisplayTransform = {
  rotationDeg: RotationDeg;
  flipH: boolean;
  flipV: boolean;
};

type ViewportDisplayTransforms = Record<MprViewportKey, ViewportDisplayTransform>;

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

type LengthDraft = {
  viewportId: string;
  plane: MeasurementPlane;
  sliceIndex: number;
  startWorld: MeasurementPoint;
  startVoxel: MeasurementPoint | null;
  endWorld: MeasurementPoint;
  endVoxel: MeasurementPoint | null;
};

type CircleRoiDraft = {
  viewportId: string;
  plane: MeasurementPlane;
  sliceIndex: number;
  centerWorld: MeasurementPoint;
  centerVoxel: MeasurementPoint | null;
  edgeWorld: MeasurementPoint;
  edgeVoxel: MeasurementPoint | null;
  radiusMm: number;
};

type MeasurementPointerData = {
  plane: MeasurementPlane;
  pointCanvas: CanvasPoint;
  sliceIndex: number;
  voxel: VoxelPoint;
  voxelPoint: MeasurementPoint;
  world: MeasurementPoint;
};

type CornerstoneVolumeViewerProps = {
  source: VolumeViewerSource;
  activeTool?: ViewerTool;
  actionRequest?: ViewerActionRequest | null;
  crosshairTarget?: ViewerCrosshairTarget | null;
  isMaskVisible?: boolean;
  maskLabels?: MaskLabelState[];
  maskOpacity?: number;
  measurements?: MedicalMeasurement[];
  showControls?: boolean;
  segmentationUrl?: string | null;
  selectedMeasurementId?: string | null;
  viewerMode?: ViewerLayoutMode;
  windowPreset?: WindowPresetId;
  onAddMeasurement?: (measurement: MedicalMeasurement) => void;
  onActiveToolChange?: (tool: ViewerTool) => void;
  onMaskOverlayStatusChange?: (status: MaskOverlayStatus) => void;
  onSelectMeasurement?: (measurementId: string | null) => void;
  onSceneReady?: () => void;
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
  measurements: MedicalMeasurement[];
  selectedMeasurementId: string | null;
  viewportDisplayTransforms: ViewportDisplayTransforms;
  onAddMeasurement?: (measurement: MedicalMeasurement) => void;
  onActiveToolChange?: (tool: ViewerTool) => void;
  onResetAllViewportDisplayTransforms: () => void;
  onResetViewportDisplayTransform: (viewportKey: MprViewportKey) => void;
  onRotateViewport: (viewportKey: MprViewportKey, direction: "left" | "right") => void;
  onMaskOverlayStatusChange?: (status: MaskOverlayStatus) => void;
  onSelectMeasurement?: (measurementId: string | null) => void;
  onSceneReady?: () => void;
  onPresetChange: (preset: WindowPresetId) => void;
  onViewportDoubleClick?: (viewportKey: MprViewportKey) => void;
  renderingEngineId: string;
  segmentationId: string;
  segmentationUrl?: string | null;
  segmentationVolumeId: string;
  source: VolumeViewerSource;
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
  pan: PanTool.toolName,
  window: WindowLevelTool.toolName,
  zoom: ZoomTool.toolName,
};

function createDefaultViewportDisplayTransform(): ViewportDisplayTransform {
  return {
    flipH: false,
    flipV: false,
    rotationDeg: 0,
  };
}

function createDefaultViewportDisplayTransforms(): ViewportDisplayTransforms {
  return {
    axial: createDefaultViewportDisplayTransform(),
    coronal: createDefaultViewportDisplayTransform(),
    sagittal: createDefaultViewportDisplayTransform(),
  };
}

function normalizeRotationDeg(rotationDeg: number): RotationDeg {
  const normalized = ((rotationDeg % 360) + 360) % 360;

  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }

  return 0;
}

function applyViewportDisplayTransform(
  viewport: Types.IViewport | undefined,
  transform: ViewportDisplayTransform,
) {
  const displayViewport = viewport as
    | (Types.IViewport & {
        getCamera?: () => {
          flipHorizontal?: boolean;
          flipVertical?: boolean;
        };
        setCamera?: (camera: {
          flipHorizontal?: boolean;
          flipVertical?: boolean;
        }) => void;
        setViewPresentation?: (presentation: {
          flipHorizontal?: boolean;
          flipVertical?: boolean;
          rotation?: number;
        }) => void;
      })
    | undefined;

  if (!displayViewport) {
    return;
  }

  try {
    displayViewport.setViewPresentation?.({
      flipHorizontal: transform.flipH,
      flipVertical: transform.flipV,
      rotation: transform.rotationDeg,
    });
  } catch {
    displayViewport.setCamera?.({
      flipHorizontal: transform.flipH,
      flipVertical: transform.flipV,
    });
  }

  displayViewport.render();
}

function getDisplayVoiRange(preset: WindowPreset) {
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

function getSourceKey(source: VolumeViewerSource) {
  if (source.type === "dicom") {
    return `dicom-${source.imageIds.length}-${source.imageIds[0] || "empty"}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
  }

  return `nifti-${source.url}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

async function createSourceImageIds(source: VolumeViewerSource) {
  if (source.type === "dicom") {
    return source.imageIds;
  }

  return createNiftiImageIds(source.url);
}

async function createSourceVolume(source: VolumeViewerSource, volumeId: string) {
  const imageIds = await createSourceImageIds(source);

  if (!imageIds.length) {
    throw new Error(
      source.type === "dicom"
        ? "Aucune image DICOM exploitable pour Cornerstone3D."
        : "Aucune image NIfTI exploitable pour Cornerstone3D.",
    );
  }

  if (source.type === "dicom") {
    await Promise.all(imageIds.map((imageId) => imageLoader.loadAndCacheImage(imageId)));

    return volumeLoader.createAndCacheVolumeFromImagesSync(volumeId, imageIds);
  }

  return volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
}

function releaseSourceResources(source: VolumeViewerSource) {
  if (source.type === "nifti") {
    releaseDecompressedNiftiUrl(source.url);
  }
}

function getPreset(presetId: WindowPresetId) {
  return windowPresets.find((item) => item.id === presetId) || windowPresets[0];
}

function getSliceTotal(
  source: VolumeViewerSource,
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

function getInitialSliceIndices(source: VolumeViewerSource) {
  return {
    axial: Math.floor(getSliceTotal(source, "axial") / 2),
    coronal: Math.floor(getSliceTotal(source, "coronal") / 2),
    sagittal: Math.floor(getSliceTotal(source, "sagittal") / 2),
  };
}

function getVolumeShape(source: VolumeViewerSource) {
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
  source: VolumeViewerSource,
): VoxelPoint {
  const shape = getVolumeShape(source);

  return {
    i: clampSliceIndex(Math.round(voxel.i), shape.i),
    j: clampSliceIndex(Math.round(voxel.j), shape.j),
    k: clampSliceIndex(Math.round(voxel.k), shape.k),
  };
}

function createInitialMprState(
  source: VolumeViewerSource,
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
  source: VolumeViewerSource,
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

function formatSpacing(source: VolumeViewerSource) {
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
  _source: VolumeViewerSource,
) {
  return value;
}

function readVoxelClinicalValue(
  voxel: VoxelPoint,
  source: VolumeViewerSource,
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

    return getClinicalHuValue(value, source);
  } catch {
    return null;
  }
}

function readVoxelHu(
  voxel: VoxelPoint,
  source: VolumeViewerSource,
  volumeId: string,
) {
  const value = readVoxelClinicalValue(voxel, source, volumeId);

  return value == null ? null : Math.round(value);
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
  source: VolumeViewerSource,
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

function getFallbackAffine(source: VolumeViewerSource) {
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

function getVolumeAffine(source: VolumeViewerSource) {
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
  source: VolumeViewerSource,
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

function voxelToWorldFromVolume(
  voxel: VoxelPoint,
  source: VolumeViewerSource,
  volumeId: string,
): Types.Point3 {
  const volume = cache.getVolume(volumeId);
  const imageData = volume?.imageData as
    | {
        indexToWorld?: (voxelPos: Types.Point3) => Types.Point3;
      }
    | undefined;

  if (imageData?.indexToWorld) {
    try {
      return imageData.indexToWorld([voxel.i, voxel.j, voxel.k]);
    } catch {
      // Fallback to metadata affine below.
    }
  }

  return voxelToWorld(voxel, source);
}

function worldToVoxel(
  world: number[],
  source: VolumeViewerSource,
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

function worldToVoxelFromVolume(
  world: number[] | null,
  source: VolumeViewerSource,
  volumeId: string,
): VoxelPoint | null {
  if (!world || world.length < 3) {
    return null;
  }

  const volume = cache.getVolume(volumeId);
  const imageData = volume?.imageData as
    | {
        worldToIndex?: (worldPos: Types.Point3) => Types.Point3;
      }
    | undefined;

  if (imageData?.worldToIndex) {
    try {
      const voxel = imageData.worldToIndex([world[0], world[1], world[2]]);

      return {
        i: voxel[0],
        j: voxel[1],
        k: voxel[2],
      };
    } catch {
      // Fallback to metadata affine below.
    }
  }

  return worldToVoxel(world, source);
}

function applyWindowPreset(
  viewports: Types.IViewport[],
  presetId: WindowPresetId,
) {
  const preset = getPreset(presetId);

  viewports.forEach((viewport) => {
    const voiViewport = viewport as VoiViewport;

    if (!voiViewport.setProperties) {
      return;
    }

    voiViewport.setProperties({
      voiRange: getDisplayVoiRange(preset),
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

function createMeasurementId(type: MedicalMeasurement["type"]) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${type}-${randomId}`;
}

function getMeasurementColor(type: MedicalMeasurement["type"]) {
  if (type === "length") {
    return "rgb(56, 189, 248)";
  }

  if (type === "hu_probe") {
    return "rgb(52, 211, 153)";
  }

  return "rgb(250, 204, 21)";
}

function isCustomMeasurementTool(tool: ViewerTool) {
  return tool === "length" || tool === "hu" || tool === "circle_roi";
}

function getMeasurementDraftOverlay(
  lengthDraft: LengthDraft | null,
  circleRoiDraft: CircleRoiDraft | null,
): MeasurementDraft | null {
  if (lengthDraft) {
    return {
      endWorld: lengthDraft.endWorld,
      endVoxel: lengthDraft.endVoxel || undefined,
      sliceIndex: lengthDraft.sliceIndex,
      startVoxel: lengthDraft.startVoxel || undefined,
      startWorld: lengthDraft.startWorld,
      type: "length",
      viewportPlane: lengthDraft.plane,
    };
  }

  if (circleRoiDraft) {
    return {
      centerWorld: circleRoiDraft.centerWorld,
      centerVoxel: circleRoiDraft.centerVoxel || undefined,
      edgeVoxel: circleRoiDraft.edgeVoxel || undefined,
      edgeWorld: circleRoiDraft.edgeWorld,
      radiusMm: circleRoiDraft.radiusMm,
      sliceIndex: circleRoiDraft.sliceIndex,
      type: "circle_roi",
      viewportPlane: circleRoiDraft.plane,
    };
  }

  return null;
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

function createMaskSegments(maskLabels: MaskLabelState[] = []) {
  const presentLabels = maskLabels.filter(
    (label) => Number.isFinite(label.labelId) && label.labelId > 0 && label.isPresent,
  );

  if (!presentLabels.length) {
    return {
      1: {
        active: true,
        label: "Segment 1",
        locked: false,
      },
    };
  }

  return Object.fromEntries(
    presentLabels.map((label, index) => [
      label.labelId,
      {
        active: index === 0,
        label: label.name || `Segment ${label.labelId}`,
        locked: false,
      },
    ]),
  );
}

function getMaskLabelDefinitionKey(maskLabels: MaskLabelState[] = []) {
  return maskLabels
    .filter((label) => Number.isFinite(label.labelId) && label.labelId > 0)
    .map((label) =>
      [
        label.labelId,
        label.isPresent ? "present" : "absent",
        label.name,
        label.color,
      ].join(":"),
    )
    .join("|");
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
  source,
  toolGroupId,
  volumeId,
}: {
  renderingEngine: RenderingEngine | null;
  segmentationId: string;
  segmentationVolumeId: string;
  segmentationUrl?: string | null;
  source: VolumeViewerSource;
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
  releaseSourceResources(source);

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

function DisplayControlButton({
  children,
  label,
  onClick,
}: {
  children: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="pointer-events-auto h-6 rounded border border-border-soft bg-black/70 px-1.5 text-[10px] font-semibold text-text-soft hover:border-primary/70 hover:text-text"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function ViewportDisplayControls({
  onReset,
  onRotateLeft,
  onRotateRight,
  transform,
}: {
  onReset: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  transform: ViewportDisplayTransform;
}) {
  return (
    <div className="absolute right-2 top-2 z-30 flex items-center gap-1">
      <span className="pointer-events-none rounded bg-black/70 px-1.5 py-1 text-[10px] font-semibold text-text-muted">
        {transform.rotationDeg}
      </span>
      <DisplayControlButton label="Rotate left 90 degrees" onClick={onRotateLeft}>
        L90
      </DisplayControlButton>
      <DisplayControlButton label="Rotate right 90 degrees" onClick={onRotateRight}>
        R90
      </DisplayControlButton>
      <DisplayControlButton label="Reset rotation" onClick={onReset}>
        0
      </DisplayControlButton>
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
  measurements,
  onAddMeasurement,
  onActiveToolChange,
  onResetAllViewportDisplayTransforms,
  onResetViewportDisplayTransform,
  onMaskOverlayStatusChange,
  onRotateViewport,
  onSceneReady,
  onSelectMeasurement,
  onPresetChange,
  onViewportDoubleClick,
  renderingEngineId,
  segmentationId,
  segmentationUrl,
  segmentationVolumeId,
  selectedMeasurementId,
  source,
  studyId,
  toolGroupId,
  viewportDisplayTransforms,
  volumeId,
}: VolumeRenderingAreaProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportElementsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const activeViewportIdRef = useRef<string | null>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const setupTokenRef = useRef(0);
  const viewportsRef = useRef<Types.IViewport[]>([]);
  const viewportsByIdRef = useRef<Record<string, Types.IViewport | undefined>>({});
  const requestedSliceByViewportIdRef = useRef<Record<string, number>>({});
  const isRenderingReadyRef = useRef(false);
  const isMaskVisibleRef = useRef(isMaskVisible);
  const isMaskOverlayLoadedRef = useRef(false);
  const maskLabelsRef = useRef(maskLabels);
  const maskOpacityRef = useRef(maskOpacity);
  const activePresetRef = useRef(activePreset);
  const activeToolRef = useRef(activeTool);
  const lastModeToolRef = useRef<ViewerTool>("crosshair");
  const lengthDraftRef = useRef<LengthDraft | null>(null);
  const circleRoiDraftRef = useRef<CircleRoiDraft | null>(null);
  const handledActionRequestIdRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeViewportId, setActiveViewportId] = useState<string | null>(null);
  const [mprState, setMprState] = useState(() => createInitialMprState(source));
  const [lengthDraft, setLengthDraft] = useState<LengthDraft | null>(null);
  const [circleRoiDraft, setCircleRoiDraft] = useState<CircleRoiDraft | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [maskOverlayStatus, setMaskOverlayStatus] = useState<MaskOverlayStatus>("idle");
  const [overlayRenderTick, setOverlayRenderTick] = useState(0);
  const [probeByViewportId, setProbeByViewportId] = useState<
    Record<string, ViewportProbeState | null>
  >({});
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const maskLabelDefinitionKey = useMemo(
    () => getMaskLabelDefinitionKey(maskLabels),
    [maskLabels],
  );
  activeToolRef.current = activeTool;
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
    () => voxelToWorldFromVolume(mprState.crosshairVoxel, source, volumeId),
    [mprState.crosshairVoxel, source, volumeId],
  );

  const clearMeasurementDrafts = useCallback(() => {
    lengthDraftRef.current = null;
    circleRoiDraftRef.current = null;
    setLengthDraft(null);
    setCircleRoiDraft(null);
  }, []);

  const updateMaskOverlayStatus = useCallback(
    (status: MaskOverlayStatus) => {
      setMaskOverlayStatus(status);
      onMaskOverlayStatusChange?.(status);
    },
    [onMaskOverlayStatusChange],
  );

  const requestMeasurementOverlayRender = useCallback(() => {
    setOverlayRenderTick((value) => (value + 1) % 100000);
  }, []);

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

  const applyViewportDisplayTransforms = useCallback(() => {
    viewportConfigs.forEach((config) => {
      applyViewportDisplayTransform(
        viewportsByIdRef.current[config.id],
        viewportDisplayTransforms[config.key],
      );
    });
    renderingEngineRef.current?.renderViewports(viewportIds);
  }, [viewportConfigs, viewportDisplayTransforms, viewportIds]);

  const jumpViewportToSlice = useCallback(
    (viewportId: string, imageIndex: number) => {
      const element = viewportElementsRef.current[viewportId];

      if (!element) {
        return;
      }

      requestedSliceByViewportIdRef.current[viewportId] = imageIndex;

      void cornerstoneUtilities
        .jumpToSlice(element, {
          debounceLoading: false,
          imageIndex,
          volumeId,
        })
        .then(() => {
          const latestImageIndex = requestedSliceByViewportIdRef.current[viewportId];

          if (latestImageIndex !== imageIndex) {
            jumpViewportToSlice(viewportId, latestImageIndex);
            return;
          }

          viewportsByIdRef.current[viewportId]?.render();
        })
        .catch((syncError) => {
          if (import.meta.env.DEV) {
            console.warn("[Cornerstone MPR sync]", syncError);
          }
        });
    },
    [volumeId],
  );

  const syncMprViewportsToCrosshair = useCallback(
    (sliceIndexByPlane: SliceIndexByPlane, skipViewportId?: string) => {
      if (!isRenderingReadyRef.current) {
        return;
      }

      viewportConfigs.forEach((config) => {
        if (config.id === skipViewportId) {
          viewportsByIdRef.current[config.id]?.render();
          return;
        }

        jumpViewportToSlice(config.id, sliceIndexByPlane[config.key]);
      });

      renderingEngineRef.current?.renderViewports(viewportIds);
    },
    [jumpViewportToSlice, viewportConfigs, viewportIds],
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
      clearMeasurementDrafts();
      setToolMessage(null);
    },
    [clearMeasurementDrafts, source, syncMprViewportsToCrosshair],
  );

  const applyCrosshairVoxelFromViewport = useCallback(
    (voxel: VoxelPoint, viewportId: string) => {
      const viewportKey = getPlaneByViewportId(viewportId, viewportConfigs);

      if (!viewportKey) {
        return;
      }

      const currentSlices = mprState.sliceIndexByPlane;
      const nextVoxel = clampVoxelPoint(
        {
          ...voxel,
          ...(viewportKey === "axial" ? { k: currentSlices.axial } : {}),
          ...(viewportKey === "sagittal" ? { i: currentSlices.sagittal } : {}),
          ...(viewportKey === "coronal" ? { j: currentSlices.coronal } : {}),
        },
        source,
      );
      const nextSliceIndexByPlane = {
        ...getSliceIndicesFromVoxel(nextVoxel),
        [viewportKey]: currentSlices[viewportKey],
      };

      setMprState((currentState) => ({
        ...currentState,
        crosshairVoxel: nextVoxel,
        sliceIndexByPlane: nextSliceIndexByPlane,
      }));
      syncMprViewportsToCrosshair(nextSliceIndexByPlane, viewportId);
      clearMeasurementDrafts();
      setToolMessage(null);
    },
    [
      clearMeasurementDrafts,
      mprState.sliceIndexByPlane,
      source,
      syncMprViewportsToCrosshair,
      viewportConfigs,
    ],
  );

  const lockVoxelToViewportSlice = useCallback(
    (voxel: VoxelPoint, viewportKey: MprViewportKey) => {
      return clampVoxelPoint(
        {
          ...voxel,
          ...(viewportKey === "axial" ? { k: mprState.sliceIndexByPlane.axial } : {}),
          ...(viewportKey === "sagittal" ? { i: mprState.sliceIndexByPlane.sagittal } : {}),
          ...(viewportKey === "coronal" ? { j: mprState.sliceIndexByPlane.coronal } : {}),
        },
        source,
      );
    },
    [mprState.sliceIndexByPlane, source],
  );

  const getViewportClickVoxel = useCallback(
    (event: PointerEvent<HTMLElement>, viewportId: string): VoxelPoint | null => {
      const point = getCanvasPointerPosition(event, viewportElementsRef.current[viewportId]);
      const viewportKey = getPlaneByViewportId(viewportId, viewportConfigs);
      const viewport =
        viewportsByIdRef.current[viewportId] || renderingEngineRef.current?.getViewport(viewportId);

      if (!viewportKey) {
        return null;
      }

      if (point) {
        const worldPoint = getWorldPoint(viewport, point);
        const voxelPoint = worldToVoxelFromVolume(worldPoint, source, volumeId);

        if (voxelPoint) {
          return lockVoxelToViewportSlice(voxelPoint, viewportKey);
        }
      }

      const position = getRelativePointerPosition(event, viewportElementsRef.current[viewportId]);

      if (!position) {
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
    [
      lockVoxelToViewportSlice,
      mprState.crosshairVoxel,
      source,
      viewportConfigs,
      volumeId,
    ],
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
      const voxel = worldToVoxelFromVolume(world, source, volumeId);
      const viewportKey = getPlaneByViewportId(viewportId, viewportConfigs);

      if (!voxel || !viewportKey) {
        return {
          hu: null,
          voxel: null,
          world,
        };
      }

      const clampedVoxel = lockVoxelToViewportSlice(voxel, viewportKey);
      const clampedWorld = voxelToWorldFromVolume(clampedVoxel, source, volumeId);

      return {
        hu: readVoxelHu(clampedVoxel, source, volumeId),
        voxel: clampedVoxel,
        world: clampedWorld,
      };
    },
    [lockVoxelToViewportSlice, source, viewportConfigs, volumeId],
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

  const getMeasurementPointerData = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      viewportId: string,
    ): MeasurementPointerData | null => {
      const point = getCanvasPointerPosition(event, viewportElementsRef.current[viewportId]);
      const plane = getPlaneByViewportId(viewportId, viewportConfigs);
      const viewport =
        viewportsByIdRef.current[viewportId] || renderingEngineRef.current?.getViewport(viewportId);

      if (!point || !plane) {
        return null;
      }

      const world = getWorldPoint(viewport, point);

      if (!world) {
        setToolMessage("Coordonnées monde indisponibles pour cette mesure.");
        return null;
      }

      const voxel = worldToVoxelFromVolume(world, source, volumeId);

      if (!voxel) {
        setToolMessage("Coordonnées voxel indisponibles pour cette mesure.");
        return null;
      }

      const clampedVoxel = lockVoxelToViewportSlice(voxel, plane);
      const clampedWorld = voxelToWorldFromVolume(clampedVoxel, source, volumeId);

      return {
        plane,
        pointCanvas: point,
        sliceIndex: mprState.sliceIndexByPlane[plane],
        voxel: clampedVoxel,
        voxelPoint: voxelToMeasurementPoint(clampedVoxel),
        world: toMeasurementPoint(clampedWorld),
      };
    },
    [lockVoxelToViewportSlice, mprState.sliceIndexByPlane, source, viewportConfigs, volumeId],
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
      applyCrosshairVoxelFromViewport(voxel, viewportId);
    },
    [
      applyCrosshairVoxelFromViewport,
      getViewportClickVoxel,
      isLoading,
      isSceneReady,
      setActiveViewport,
    ],
  );

  const getLengthMeasurementData = useCallback(
    (draft: LengthDraft, pointerData: MeasurementPointerData) => {
      const pointsWorld: [MeasurementPoint, MeasurementPoint] = [
        draft.startWorld,
        pointerData.world,
      ];
      const pointsVoxel =
        draft.startVoxel && pointerData.voxelPoint
          ? ([draft.startVoxel, pointerData.voxelPoint] as [
              MeasurementPoint,
              MeasurementPoint,
            ])
          : undefined;

      return {
        lengthMm: getLengthMm({
          pointsVoxel,
          pointsWorld,
          spacing: source.metadata?.spacing,
        }),
        pointsVoxel,
        pointsWorld,
      };
    },
    [source.metadata?.spacing],
  );

  const finalizeLengthMeasurement = useCallback(
    (draft: LengthDraft, pointerData: MeasurementPointerData) => {
      if (!studyId) {
        setToolMessage("Etude indisponible pour la mesure.");
        return;
      }

      const { lengthMm, pointsVoxel, pointsWorld } = getLengthMeasurementData(draft, pointerData);

      if (!Number.isFinite(lengthMm) || lengthMm < 0.1) {
        setToolMessage("Distance trop courte.");
        return;
      }

      onAddMeasurement?.({
        color: getMeasurementColor("length"),
        createdAt: new Date().toISOString(),
        id: createMeasurementId("length"),
        lengthMm,
        pointsVoxel,
        pointsWorld,
        sliceIndex: draft.sliceIndex,
        studyId,
        type: "length",
        viewportPlane: draft.plane,
      });
      clearMeasurementDrafts();
      setToolMessage(`Distance ${lengthMm.toFixed(1)} mm`);
    },
    [clearMeasurementDrafts, getLengthMeasurementData, onAddMeasurement, studyId],
  );

  const updateCircleRoiDraftFromPointer = useCallback(
    (draft: CircleRoiDraft, pointerData: MeasurementPointerData): CircleRoiDraft => {
      const pointsVoxel =
        draft.centerVoxel && pointerData.voxelPoint
          ? ([draft.centerVoxel, pointerData.voxelPoint] as [
              MeasurementPoint,
              MeasurementPoint,
            ])
          : undefined;
      const worldRadiusMm = getLengthMm({
        pointsVoxel,
        pointsWorld: [draft.centerWorld, pointerData.world],
        spacing: source.metadata?.spacing,
      });
      const radiusMm = getPlaneRadiusMm({
        centerVoxel: draft.centerVoxel || undefined,
        edgeVoxel: pointerData.voxelPoint,
        plane: draft.plane,
        spacing: source.metadata?.spacing,
        worldRadiusMm,
      });

      return {
        ...draft,
        edgeVoxel: pointerData.voxelPoint,
        edgeWorld: pointerData.world,
        radiusMm,
      };
    },
    [source.metadata?.spacing],
  );

  const finalizeCircleRoiMeasurement = useCallback(
    (draft: CircleRoiDraft) => {
      if (!studyId) {
        setToolMessage("Etude indisponible pour la mesure.");
        return;
      }

      if (!draft.centerVoxel || draft.radiusMm < 0.5) {
        setToolMessage("Définissez un rayon avant de valider la ROI.");
        return;
      }

      const shape = getVolumeShape(source);
      const stats = calculateCircleRoiStats({
        centerVoxel: draft.centerVoxel,
        plane: draft.plane,
        radiusMm: draft.radiusMm,
        readHu: (voxel) =>
          readVoxelClinicalValue(clampVoxelPoint(voxel, source), source, volumeId),
        shape,
        spacing: source.metadata?.spacing,
      });
      const radiusVoxel = draft.edgeVoxel
        ? Math.sqrt(
            (draft.centerVoxel[0] - draft.edgeVoxel[0]) ** 2 +
              (draft.centerVoxel[1] - draft.edgeVoxel[1]) ** 2 +
              (draft.centerVoxel[2] - draft.edgeVoxel[2]) ** 2,
          )
        : undefined;

      onAddMeasurement?.({
        centerVoxel: draft.centerVoxel,
        centerWorld: draft.centerWorld,
        color: getMeasurementColor("circle_roi"),
        createdAt: new Date().toISOString(),
        edgeVoxel: draft.edgeVoxel || undefined,
        edgeWorld: draft.edgeWorld,
        id: createMeasurementId("circle_roi"),
        maxHu: stats.maxHu,
        meanHu: stats.meanHu,
        minHu: stats.minHu,
        radiusMm: draft.radiusMm,
        radiusVoxel,
        sliceIndex: draft.sliceIndex,
        stdHu: stats.stdHu,
        studyId,
        type: "circle_roi",
        viewportPlane: draft.plane,
        voxelCount: stats.voxelCount,
      });
      clearMeasurementDrafts();
      setToolMessage(
        stats.meanHu == null
          ? "ROI créée, HU indisponible."
          : `ROI mean ${Math.round(stats.meanHu)} HU`,
      );
    },
    [clearMeasurementDrafts, onAddMeasurement, source, studyId, volumeId],
  );

  const handleMeasurementPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      const tool = activeTool;

      if (!isCustomMeasurementTool(tool) || isLoading || !isSceneReady) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      setActiveViewport(viewportId);
      const pointerData = getMeasurementPointerData(event, viewportId);

      if (!pointerData) {
        return true;
      }

      setToolMessage(null);

      if (tool === "hu") {
        if (!studyId) {
          setToolMessage("Etude indisponible pour la mesure.");
          return true;
        }

        clearMeasurementDrafts();
        onAddMeasurement?.({
          color: getMeasurementColor("hu_probe"),
          createdAt: new Date().toISOString(),
          hu: readVoxelHu(pointerData.voxel, source, volumeId),
          id: createMeasurementId("hu_probe"),
          pointVoxel: pointerData.voxelPoint,
          pointWorld: pointerData.world,
          sliceIndex: pointerData.sliceIndex,
          studyId,
          type: "hu_probe",
          viewportPlane: pointerData.plane,
        });
        return true;
      }

      if (tool === "length") {
        const currentDraft = lengthDraftRef.current;

        if (currentDraft?.viewportId === viewportId) {
          finalizeLengthMeasurement(currentDraft, pointerData);
          return true;
        }

        const nextDraft: LengthDraft = {
          endVoxel: pointerData.voxelPoint,
          endWorld: pointerData.world,
          plane: pointerData.plane,
          sliceIndex: pointerData.sliceIndex,
          startVoxel: pointerData.voxelPoint,
          startWorld: pointerData.world,
          viewportId,
        };

        lengthDraftRef.current = nextDraft;
        circleRoiDraftRef.current = null;
        setLengthDraft(nextDraft);
        setCircleRoiDraft(null);
        return true;
      }

      const currentDraft = circleRoiDraftRef.current;

      if (currentDraft?.viewportId === viewportId && currentDraft.radiusMm >= 0.5) {
        finalizeCircleRoiMeasurement(updateCircleRoiDraftFromPointer(currentDraft, pointerData));
        return true;
      }

      const nextDraft: CircleRoiDraft = {
        centerVoxel: pointerData.voxelPoint,
        centerWorld: pointerData.world,
        edgeVoxel: pointerData.voxelPoint,
        edgeWorld: pointerData.world,
        plane: pointerData.plane,
        radiusMm: 0,
        sliceIndex: pointerData.sliceIndex,
        viewportId,
      };

      circleRoiDraftRef.current = nextDraft;
      lengthDraftRef.current = null;
      setCircleRoiDraft(nextDraft);
      setLengthDraft(null);
      return true;
    },
    [
      activeTool,
      clearMeasurementDrafts,
      finalizeCircleRoiMeasurement,
      finalizeLengthMeasurement,
      getMeasurementPointerData,
      isLoading,
      isSceneReady,
      onAddMeasurement,
      setActiveViewport,
      source,
      studyId,
      updateCircleRoiDraftFromPointer,
      volumeId,
    ],
  );

  const handleMeasurementPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      const tool = activeTool;

      if (!isCustomMeasurementTool(tool) || isLoading || !isSceneReady) {
        return false;
      }

      if (tool === "hu") {
        return true;
      }

      const pointerData = getMeasurementPointerData(event, viewportId);

      if (!pointerData) {
        return true;
      }

      if (tool === "length") {
        const currentDraft = lengthDraftRef.current;

        if (!currentDraft || currentDraft.viewportId !== viewportId) {
          return true;
        }

        const nextDraft = {
          ...currentDraft,
          endVoxel: pointerData.voxelPoint,
          endWorld: pointerData.world,
        };

        lengthDraftRef.current = nextDraft;
        setLengthDraft(nextDraft);
        return true;
      }

      const currentDraft = circleRoiDraftRef.current;

      if (!currentDraft || currentDraft.viewportId !== viewportId) {
        return true;
      }

      const nextDraft = updateCircleRoiDraftFromPointer(currentDraft, pointerData);

      circleRoiDraftRef.current = nextDraft;
      setCircleRoiDraft(nextDraft);
      return true;
    },
    [
      activeTool,
      getMeasurementPointerData,
      isLoading,
      isSceneReady,
      updateCircleRoiDraftFromPointer,
    ],
  );

  const handleMeasurementPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      if (activeTool !== "length" && activeTool !== "circle_roi") {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      if (activeTool === "length") {
        const currentDraft = lengthDraftRef.current;

        if (!currentDraft || currentDraft.viewportId !== viewportId) {
          return true;
        }

        const pointerData = getMeasurementPointerData(event, viewportId);

        if (!pointerData) {
          return true;
        }

        const { lengthMm } = getLengthMeasurementData(currentDraft, pointerData);

        if (!Number.isFinite(lengthMm) || lengthMm < 0.5) {
          return true;
        }

        finalizeLengthMeasurement(currentDraft, pointerData);
        return true;
      }

      const currentDraft = circleRoiDraftRef.current;

      if (!currentDraft || currentDraft.viewportId !== viewportId || currentDraft.radiusMm < 0.5) {
        return true;
      }

      const pointerData = getMeasurementPointerData(event, viewportId);
      const nextDraft = pointerData
        ? updateCircleRoiDraftFromPointer(currentDraft, pointerData)
        : currentDraft;

      finalizeCircleRoiMeasurement(nextDraft);
      return true;
    },
    [
      activeTool,
      finalizeCircleRoiMeasurement,
      finalizeLengthMeasurement,
      getLengthMeasurementData,
      getMeasurementPointerData,
      updateCircleRoiDraftFromPointer,
    ],
  );

  const handleViewportPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      setActiveViewport(viewportId);
      updateViewportProbe(event, viewportId);

      if (handleMeasurementPointerDown(event, viewportId)) {
        return;
      }

      if (activeTool !== "crosshair") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setMprState((currentState) => ({
        ...currentState,
        isDraggingCrosshair: true,
      }));
      updateCrosshairPositionFromEvent(event, viewportId);
    },
    [
      activeTool,
      handleMeasurementPointerDown,
      setActiveViewport,
      updateCrosshairPositionFromEvent,
      updateViewportProbe,
    ],
  );

  const handleViewportPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      updateViewportProbe(event, viewportId);

      if (handleMeasurementPointerMove(event, viewportId)) {
        return;
      }

      if (activeTool !== "crosshair" || event.buttons !== 1) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      updateCrosshairPositionFromEvent(event, viewportId);
    },
    [
      activeTool,
      handleMeasurementPointerMove,
      updateCrosshairPositionFromEvent,
      updateViewportProbe,
    ],
  );

  const handleViewportPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>, viewportId: string) => {
      handleMeasurementPointerUp(event, viewportId);
      setMprState((currentState) => ({
        ...currentState,
        isDraggingCrosshair: false,
      }));
    },
    [handleMeasurementPointerUp],
  );

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
        voiRange: getDisplayVoiRange(preset),
      });

      viewport.render();
    });

    const initialMprState = createInitialMprState(source);

    applyViewportDisplayTransforms();
    setMprState(initialMprState);
    syncMprViewportsToCrosshair(initialMprState.sliceIndexByPlane);
    clearMeasurementDrafts();
    setToolMessage(null);
    onPresetChange(preset.id);
    onActiveToolChange?.("crosshair");
  }, [
    clearMeasurementDrafts,
    onActiveToolChange,
    onPresetChange,
    applyViewportDisplayTransforms,
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
    applyWindowPreset(viewportsRef.current, activePreset);
  }, [activePreset]);

  useEffect(() => {
    if (!isRenderingReadyRef.current) {
      return;
    }

    applyViewportDisplayTransforms();
  }, [applyViewportDisplayTransforms]);

  useEffect(() => {
    const initialMprState = createInitialMprState(source);

    setMprState(initialMprState);
    setProbeByViewportId({});
    clearMeasurementDrafts();
    syncMprViewportsToCrosshair(initialMprState.sliceIndexByPlane);
  }, [clearMeasurementDrafts, source, syncMprViewportsToCrosshair]);

  useEffect(() => {
    activeToolRef.current = activeTool;
    clearMeasurementDrafts();

    if (activeTool !== "none") {
      lastModeToolRef.current = activeTool;
    }
  }, [activeTool, clearMeasurementDrafts]);

  useEffect(() => {
    clearMeasurementDrafts();
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
  }, [clearMeasurementDrafts, clearTemporaryKey, viewportIds]);

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
      const voxel = worldToVoxelFromVolume(crosshairTarget.world, source, volumeId);

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
  }, [applyMprVoxel, crosshairTarget, mprState.crosshairVoxel.k, sliceIndices, source, volumeId]);

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

        const volume = await createSourceVolume(source, volumeId);

        await volume.load();

        if (isCancelled || setupToken !== setupTokenRef.current) {
          disposeStudyResources({
            renderingEngine,
            segmentationId,
            segmentationVolumeId,
            segmentationUrl: null,
            source,
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

        const initialSliceIndexByPlane = createInitialMprState(source).sliceIndexByPlane;

        applyWindowPreset(nextViewports, activePresetRef.current);
        viewportConfigs.forEach((config) => {
          applyViewportDisplayTransform(
            nextViewports[viewportIds.indexOf(config.id)],
            viewportDisplayTransforms[config.key],
          );
        });
        renderingEngine.resize(true, false);
        renderingEngine.renderViewports(viewportIds);
        viewportConfigs.forEach((config) => {
          const element = viewportElementsRef.current[config.id];
          const imageIndex = initialSliceIndexByPlane[config.key];

          if (!element) {
            return;
          }

          requestedSliceByViewportIdRef.current[config.id] = imageIndex;

          void cornerstoneUtilities
            .jumpToSlice(element, {
              debounceLoading: false,
              imageIndex,
              volumeId,
            })
            .then(() => {
              if (isCancelled || setupToken !== setupTokenRef.current) {
                return;
              }

              viewportsByIdRef.current[config.id]?.render();
              renderingEngine?.renderViewports([config.id]);
            })
            .catch((syncError) => {
              if (import.meta.env.DEV) {
                console.warn("[Cornerstone MPR initial sync]", syncError);
              }
            });
        });

        await waitForFinalPaint();
        if (isCancelled || setupToken !== setupTokenRef.current) {
          return;
        }

        renderingEngine.resize(true, false);
        renderingEngine.renderViewports(viewportIds);
        await waitForFinalPaint();

        if (!isCancelled && setupToken === setupTokenRef.current) {
          setIsSceneReady(true);
          onSceneReady?.();
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
          source,
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
        source,
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
    source,
    toolGroupId,
    updateMaskOverlayStatus,
    onSceneReady,
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
              segments: createMaskSegments(maskLabelsRef.current),
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
    maskLabelDefinitionKey,
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

  useEffect(() => {
    if (!isSceneReady) {
      return undefined;
    }

    const viewportElements = viewportIds
      .map((viewportId) => viewportElementsRef.current[viewportId])
      .filter((element): element is HTMLDivElement => Boolean(element));
    const events = [
      Enums.Events.CAMERA_MODIFIED,
      Enums.Events.IMAGE_RENDERED,
      Enums.Events.VOI_MODIFIED,
      Enums.Events.VOLUME_VIEWPORT_SCROLL,
    ];

    viewportElements.forEach((element) => {
      events.forEach((eventName) => {
        element.addEventListener(eventName, requestMeasurementOverlayRender);
      });
    });

    return () => {
      viewportElements.forEach((element) => {
        events.forEach((eventName) => {
          element.removeEventListener(eventName, requestMeasurementOverlayRender);
        });
      });
    };
  }, [isSceneReady, requestMeasurementOverlayRender, viewportIds]);

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
  const measurementDraftOverlay = getMeasurementDraftOverlay(lengthDraft, circleRoiDraft);
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
        const projectWorldToCanvas = (point: MeasurementPoint) => {
          const viewport = viewportsByIdRef.current[config.id] as CanvasWorldViewport | undefined;

          if (!viewport?.worldToCanvas) {
            return null;
          }

          try {
            const canvasPoint = viewport.worldToCanvas([
              point[0],
              point[1],
              point[2],
            ] as Types.Point3);

            return {
              x: Number(canvasPoint[0]),
              y: Number(canvasPoint[1]),
            };
          } catch {
            return null;
          }
        };
        const projectVoxelToCanvas = (point: MeasurementPoint) => {
          const element = viewportElementsRef.current[config.id];

          if (!element?.clientWidth || !element.clientHeight) {
            return null;
          }

          const position = getVoxelCrosshairPosition(
            measurementPointToVoxel(point),
            source,
            config.key,
          );

          return {
            x: position.x * element.clientWidth,
            y: position.y * element.clientHeight,
          };
        };

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
            onPointerUp={(event) => handleViewportPointerUp(event, config.id)}
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
            <ViewportDisplayControls
              onReset={() => onResetViewportDisplayTransform(config.key)}
              onRotateLeft={() => onRotateViewport(config.key, "left")}
              onRotateRight={() => onRotateViewport(config.key, "right")}
              transform={viewportDisplayTransforms[config.key]}
            />
          ) : null}
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
          {!shouldShowLoading ? (
            <MeasurementOverlay
              canSelect={!isCustomMeasurementTool(activeTool)}
              draft={
                measurementDraftOverlay?.viewportPlane === config.key &&
                measurementDraftOverlay.sliceIndex === sliceIndex
                  ? measurementDraftOverlay
                  : null
              }
              measurements={measurements}
              onSelectMeasurement={(measurementId) => onSelectMeasurement?.(measurementId)}
              plane={config.key}
              projectVoxelToCanvas={projectVoxelToCanvas}
              projectWorldToCanvas={projectWorldToCanvas}
              renderTick={overlayRenderTick}
              selectedMeasurementId={selectedMeasurementId}
              sliceIndex={sliceIndex}
              sliceTolerance={1}
            />
          ) : null}
          </ViewportFrame>
        );
      })}

      {!shouldShowLoading && !error ? (
        <div className="absolute bottom-4 left-4 z-30">
          <DisplayControlButton
            label="Reset all orientations"
            onClick={onResetAllViewportDisplayTransforms}
          >
            Reset all
          </DisplayControlButton>
        </div>
      ) : null}

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
  measurements = [],
  onAddMeasurement,
  onActiveToolChange,
  onMaskOverlayStatusChange,
  onSceneReady,
  onSelectMeasurement,
  onViewerModeChange,
  onWindowPresetChange,
  segmentationUrl,
  selectedMeasurementId = null,
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
  const [viewportDisplayTransforms, setViewportDisplayTransforms] = useState(
    createDefaultViewportDisplayTransforms,
  );
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

  const handleRotateViewport = (
    viewportKey: MprViewportKey,
    direction: "left" | "right",
  ) => {
    setViewportDisplayTransforms((currentTransforms) => ({
      ...currentTransforms,
      [viewportKey]: {
        ...currentTransforms[viewportKey],
        rotationDeg: normalizeRotationDeg(
          currentTransforms[viewportKey].rotationDeg + (direction === "left" ? -90 : 90),
        ),
      },
    }));
  };

  const handleResetViewportDisplayTransform = (viewportKey: MprViewportKey) => {
    setViewportDisplayTransforms((currentTransforms) => ({
      ...currentTransforms,
      [viewportKey]: createDefaultViewportDisplayTransform(),
    }));
  };

  const handleResetAllViewportDisplayTransforms = () => {
    setViewportDisplayTransforms(createDefaultViewportDisplayTransforms());
  };

  const handleBackToMpr = () => {
    handleViewerModeChange("mpr");
    onActiveToolChange?.("crosshair");
  };

  useEffect(() => {
    setViewportDisplayTransforms(createDefaultViewportDisplayTransforms());
  }, [sourceKey]);

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
            measurements={measurements}
            onAddMeasurement={onAddMeasurement}
            onActiveToolChange={onActiveToolChange}
            onMaskOverlayStatusChange={onMaskOverlayStatusChange}
            onResetAllViewportDisplayTransforms={handleResetAllViewportDisplayTransforms}
            onResetViewportDisplayTransform={handleResetViewportDisplayTransform}
            onRotateViewport={handleRotateViewport}
            onSceneReady={onSceneReady}
            onSelectMeasurement={onSelectMeasurement}
            onPresetChange={handleWindowPresetChange}
            onViewportDoubleClick={(viewportKey) => {
              handleViewerModeChange(activeViewerMode === viewportKey ? "mpr" : viewportKey);
            }}
            renderingEngineId={renderingEngineId}
            segmentationId={segmentationId}
            segmentationUrl={segmentationUrl}
            segmentationVolumeId={segmentationVolumeId}
            selectedMeasurementId={selectedMeasurementId}
            source={source}
            studyId={studyId}
            toolGroupId={toolGroupId}
            viewportDisplayTransforms={viewportDisplayTransforms}
            volumeId={volumeId}
          />
        </ViewportGrid>

        {activeViewerMode === "volume3d" && source.type === "nifti" ? (
          <div className="absolute inset-0">
            <VTKVolume3DViewer
              className="h-full w-full"
              onBackToMpr={handleBackToMpr}
              source={source}
            />
          </div>
        ) : null}

        {activeViewerMode === "volume3d" && source.type === "dicom" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-viewer">
            <div className="rounded border border-border-soft bg-surface px-4 py-3 text-sm text-text-muted">
              Vue 3D disponible après préparation backend NIfTI. Les vues MPR locales restent actives.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
