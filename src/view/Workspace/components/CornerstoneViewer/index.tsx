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

import { CornerstoneStackViewer } from "../CornerstoneStackViewer";
import { CornerstoneVolumeViewer } from "../CornerstoneVolumeViewer";
import type { MaskLabelState } from "../MaskLabelsPanel";
import { cn } from "~/helpers/Cn";
import type { HuCircleMeasurement } from "~/types/Measurements";
import type { VolumeMetadata } from "~/types/Studies";
import type { MedicalMeasurement } from "../../measurements/measurementTypes";

export type ViewerTool =
  | "window"
  | "pan"
  | "zoom"
  | "length"
  | "hu"
  | "circle_roi"
  | "crosshair"
  | "none";

export type ViewerAction = "reset" | "capture" | "undo";
export type ViewerLayoutMode = "mpr" | "axial" | "sagittal" | "coronal" | "volume3d";
export type WindowPresetId = "soft" | "bone" | "lung";

export type ViewerActionRequest = {
  action: ViewerAction;
  id: number;
};

export type MaskOverlayStatus =
  | "idle"
  | "loading"
  | "active"
  | "hidden"
  | "unavailable";

export type HuMeasurementPanelState =
  | {
      status: "idle" | "draft";
    }
  | {
      status: "loading";
    }
  | {
      status: "success";
      result: HuCircleMeasurement;
    }
  | {
      status: "error";
      message: string;
    };

export type ViewerCrosshairTarget = {
  sliceIndices?: Partial<Record<"axial" | "sagittal" | "coronal", number>>;
  voxel?: number[];
  world?: number[];
  x: number;
  y: number;
};

export type CornerstoneViewerSource =
  | {
      type: "dicom";
      imageIds: string[];
      emptyMessage?: string;
    }
  | {
      type: "nifti";
      url: string;
      name?: string;
      metadata?: VolumeMetadata;
    };

type CornerstoneViewerProps = {
  source: CornerstoneViewerSource | null;
  isReady: boolean;
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
  studyId?: string;
  viewerMode?: ViewerLayoutMode;
  windowPreset?: WindowPresetId;
  onActiveToolChange?: (tool: ViewerTool) => void;
  onAddMeasurement?: (measurement: MedicalMeasurement) => void;
  onMaskOverlayStatusChange?: (status: MaskOverlayStatus) => void;
  onSelectMeasurement?: (measurementId: string | null) => void;
  onViewerModeChange?: (mode: ViewerLayoutMode) => void;
  onWindowPresetChange?: (preset: WindowPresetId) => void;
  className?: string;
};

function getMissingSourceMessage(isReady: boolean) {
  if (!isReady) {
    return "Preparez le volume pour activer le viewer medical.";
  }

  return "Aucun volume exploitable pour le viewer. Preparez le volume ou importez une serie DICOM.";
}

function getEmptyDicomMessage(source: Extract<CornerstoneViewerSource, { type: "dicom" }>) {
  return (
    source.emptyMessage ||
    "Aucune image DICOM exploitable. Un DICOMDIR seul ne contient pas les pixels. Importez les fichiers DICOM associés ou préparez le volume."
  );
}

export function CornerstoneViewer({
  actionRequest,
  activeTool = "crosshair",
  className,
  crosshairTarget,
  isMaskVisible = true,
  maskLabels = [],
  maskOpacity = 0.6,
  measurements = [],
  isReady,
  onAddMeasurement,
  onActiveToolChange,
  onMaskOverlayStatusChange,
  onSelectMeasurement,
  onViewerModeChange,
  onWindowPresetChange,
  segmentationUrl,
  selectedMeasurementId,
  showControls,
  studyId,
  source,
  viewerMode,
  windowPreset,
}: CornerstoneViewerProps) {
  if (!isReady || !source) {
    return (
      <div className={cn("flex h-full items-center justify-center bg-viewer", className)}>
        <p className="max-w-md text-center text-sm text-text-muted">
          {getMissingSourceMessage(isReady)}
        </p>
      </div>
    );
  }

  if (source.type === "nifti") {
    return (
      <CornerstoneVolumeViewer
        activeTool={activeTool}
        actionRequest={actionRequest}
        className={className}
        crosshairTarget={crosshairTarget}
        isMaskVisible={isMaskVisible}
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
        showControls={showControls}
        source={source}
        studyId={studyId}
        viewerMode={viewerMode}
        windowPreset={windowPreset}
      />
    );
  }

  if (source.imageIds.length === 0) {
    return (
      <div className={cn("flex h-full items-center justify-center bg-viewer", className)}>
        <p className="max-w-md text-center text-sm leading-relaxed text-text-muted">
          {getEmptyDicomMessage(source)}
        </p>
      </div>
    );
  }

  return (
    <CornerstoneStackViewer
      className={className}
      imageIds={source.imageIds}
      isMaskVisible={isMaskVisible}
      segmentationUrl={segmentationUrl}
      showControls={showControls}
      windowPreset={windowPreset}
      onWindowPresetChange={onWindowPresetChange}
    />
  );
}
