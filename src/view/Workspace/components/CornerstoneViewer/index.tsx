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

export type ViewerTool =
  | "window"
  | "pan"
  | "zoom"
  | "length"
  | "hu"
  | "crosshair"
  | "none";

export type ViewerAction = "reset" | "capture" | "undo";

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
  segmentationUrl?: string | null;
  studyId?: string;
  onActiveToolChange?: (tool: ViewerTool) => void;
  onHuMeasurementChange?: (state: HuMeasurementPanelState) => void;
  onMaskOverlayStatusChange?: (status: MaskOverlayStatus) => void;
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
  isReady,
  onActiveToolChange,
  onHuMeasurementChange,
  onMaskOverlayStatusChange,
  segmentationUrl,
  studyId,
  source,
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
        onActiveToolChange={onActiveToolChange}
        onHuMeasurementChange={onHuMeasurementChange}
        onMaskOverlayStatusChange={onMaskOverlayStatusChange}
        segmentationUrl={segmentationUrl}
        source={source}
        studyId={studyId}
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
    />
  );
}
