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

import { SegmentationLabelPanel } from "../MaskLabelsPanel";
import { MeasurementsPanel } from "../MeasurementsPanel";
import type { MaskOverlayStatus, ViewerTool } from "../CornerstoneViewer";
import type { MaskLabelState } from "../MaskLabelsPanel";
import { SegmentationUpload } from "../SegmentationUpload";
import { cn } from "~/helpers/Cn";
import type { StudyWorkspace } from "~/types/Workspace";
import type { MedicalMeasurement } from "../../measurements/measurementTypes";

type RightSegmentationPanelProps = {
  activeTool: ViewerTool;
  aiModuleStatus: string;
  aiUnavailableMessage: string | null;
  aiRunStatus: string | null;
  canPublishAiSegmentation: boolean;
  canRunAi: boolean;
  isAiPredicting: boolean;
  isAiPublishing: boolean;
  isBusy: boolean;
  isMaskVisible: boolean;
  maskLabels: MaskLabelState[];
  maskLabelsMessage: string | null;
  maskOverlayStatus: MaskOverlayStatus;
  maskOpacity: number;
  measurements: MedicalMeasurement[];
  selectedMeasurementId: string | null;
  workspace: StudyWorkspace;
  onCenterMaskLabel: (labelId: number) => void;
  onDeleteMeasurement: (measurementId: string) => void;
  onFocusMeasurement: (measurement: MedicalMeasurement) => void;
  onMaskOpacityChange: (opacity: number) => void;
  onPublishAiSegmentation: () => void;
  onResetMeasurements: () => void;
  onRunAiPrediction: () => void;
  onSelectMeasurement: (measurementId: string | null) => void;
  onSetAllLabelsVisible: (visible: boolean) => void;
  onSetGroupVisible: (group: string, visible: boolean) => void;
  onShowOnlyGroup: (group: string) => void;
  onToggleMask: () => void;
  onToggleMaskLabel: (labelId: number) => void;
  onUploadSegmentation: (file: File, name?: string, labelsFile?: File) => void;
};

function PanelSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="border-b border-border-soft px-3 py-3 last:border-b-0">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
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

export function RightSegmentationPanel({
  activeTool,
  aiModuleStatus,
  aiUnavailableMessage,
  aiRunStatus,
  canPublishAiSegmentation,
  canRunAi,
  isAiPredicting,
  isAiPublishing,
  isBusy,
  isMaskVisible,
  maskLabels,
  maskLabelsMessage,
  measurements,
  maskOpacity,
  maskOverlayStatus,
  onCenterMaskLabel,
  onDeleteMeasurement,
  onFocusMeasurement,
  onMaskOpacityChange,
  onPublishAiSegmentation,
  onResetMeasurements,
  onRunAiPrediction,
  onSelectMeasurement,
  onSetAllLabelsVisible,
  onSetGroupVisible,
  onShowOnlyGroup,
  onToggleMask,
  onToggleMaskLabel,
  onUploadSegmentation,
  selectedMeasurementId,
  workspace,
}: RightSegmentationPanelProps) {
  const latestSegmentation = workspace.segmentations.latest;
  const hasSegmentation = Boolean(latestSegmentation);
  const isUploadDisabled = isBusy || !workspace.volume.is_prepared;
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
    <aside className="flex w-[22rem] shrink-0 flex-col overflow-y-auto border-l border-border-soft bg-surface">
      <PanelSection title="Segmentation">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-border-soft bg-surface-100 p-2">
            <p className="text-text-muted">Masque</p>
            <p className="font-semibold text-text">{hasSegmentation ? "Disponible" : "Absent"}</p>
          </div>
          <div className="rounded border border-border-soft bg-surface-100 p-2">
            <p className="text-text-muted">Labels</p>
            <p className="font-semibold text-text">{maskLabels.length}</p>
          </div>
        </div>

        <button
          className="mt-3 h-8 w-full rounded border border-border-soft bg-surface-100 text-xs font-semibold text-text-soft transition hover:border-primary/60 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isMaskButtonDisabled}
          onClick={onToggleMask}
          type="button"
        >
          {maskButtonLabel}
        </button>
      </PanelSection>

      <PanelSection title="IA">
        <div className="mb-2 rounded border border-border-soft bg-surface-100 p-2 text-xs">
          <p className="text-text-muted">Module</p>
          <p className="font-semibold text-text">ct_anatomy_segmentation_nnunet</p>
          <p className="mt-1 text-text-muted">Status: {aiModuleStatus}</p>
        </div>
        <button
          className={cn(
            "h-9 w-full rounded border text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
            canRunAi
              ? "border-primary/60 bg-primary/20 text-primary-100 hover:border-primary"
              : "border-border-soft bg-surface-100 text-text-muted",
          )}
          disabled={!canRunAi || isBusy || isAiPredicting}
          onClick={onRunAiPrediction}
          type="button"
        >
          {isAiPredicting ? "Running AI..." : "Run AI segmentation"}
        </button>
        {canPublishAiSegmentation ? (
          <button
            className="mt-2 h-8 w-full rounded border border-primary/50 bg-surface-100 text-xs font-semibold text-primary-100 transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isAiPublishing}
            onClick={onPublishAiSegmentation}
            type="button"
          >
            {isAiPublishing ? "Publishing segmentation..." : "Publish segmentation"}
          </button>
        ) : null}
        {aiRunStatus ? (
          <p className="mt-2 text-xs leading-relaxed text-text-muted">{aiRunStatus}</p>
        ) : null}
        {aiUnavailableMessage ? (
          <p className="mt-2 text-xs leading-relaxed text-quaternary-100">{aiUnavailableMessage}</p>
        ) : null}
      </PanelSection>

      <PanelSection title="Measurements">
        <MeasurementsPanel
          measurements={measurements}
          onDeleteMeasurement={onDeleteMeasurement}
          onFocusMeasurement={onFocusMeasurement}
          onResetMeasurements={onResetMeasurements}
          onSelectMeasurement={onSelectMeasurement}
          selectedMeasurementId={selectedMeasurementId}
        />
        {activeTool === "length" || activeTool === "hu" || activeTool === "circle_roi" ? (
          <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
            Outil actif : {activeTool === "hu" ? "HU Probe" : activeTool}
          </p>
        ) : null}
      </PanelSection>

      <PanelSection title="Labels">
        <SegmentationLabelPanel
          labels={maskLabels}
          onCenterLabel={onCenterMaskLabel}
          onOpacityChange={onMaskOpacityChange}
          onSetAllLabelsVisible={onSetAllLabelsVisible}
          onSetGroupVisible={onSetGroupVisible}
          onShowOnlyGroup={onShowOnlyGroup}
          onToggleLabel={onToggleMaskLabel}
          opacity={maskOpacity}
          overlayStatus={getMaskPanelOverlayStatus(maskOverlayStatus)}
        />
        {maskLabelsMessage ? (
          <p className="mt-2 text-xs leading-relaxed text-text-muted">{maskLabelsMessage}</p>
        ) : null}
      </PanelSection>

      <PanelSection title="Masque manuel">
        <div className="rounded border border-border-soft bg-surface-100 p-3">
          <SegmentationUpload isBusy={isUploadDisabled} onUpload={onUploadSegmentation} />
          {!workspace.volume.is_prepared ? (
            <p className="mt-3 text-xs text-quaternary-100">
              Préparez le volume avant d'importer un masque.
            </p>
          ) : null}
        </div>
      </PanelSection>

    </aside>
  );
}
