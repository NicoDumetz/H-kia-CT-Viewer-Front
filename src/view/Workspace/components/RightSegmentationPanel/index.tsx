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
import type {
  HuMeasurementPanelState,
  MaskOverlayStatus,
  ViewerTool,
} from "../CornerstoneViewer";
import type { MaskLabelState } from "../MaskLabelsPanel";
import { SegmentationUpload } from "../SegmentationUpload";
import { cn } from "~/helpers/Cn";
import type { StudyWorkspace } from "~/types/Workspace";

type RightSegmentationPanelProps = {
  activeTool: ViewerTool;
  aiUnavailableMessage: string | null;
  canRunAi: boolean;
  huMeasurementState: HuMeasurementPanelState;
  isAiPredicting: boolean;
  isBusy: boolean;
  isMaskVisible: boolean;
  maskLabels: MaskLabelState[];
  maskLabelsMessage: string | null;
  maskOverlayStatus: MaskOverlayStatus;
  maskOpacity: number;
  workspace: StudyWorkspace;
  onCenterMaskLabel: (labelId: number) => void;
  onMaskOpacityChange: (opacity: number) => void;
  onRunAiPrediction: () => void;
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

function formatHuValue(value: number) {
  return `${Math.round(value)} HU`;
}

function HuMeasurementSummary({
  activeTool,
  state,
}: {
  activeTool: ViewerTool;
  state: HuMeasurementPanelState;
}) {
  if (state.status === "loading") {
    return <p className="text-xs text-text-muted">Calcul HU en cours...</p>;
  }

  if (state.status === "error") {
    return <p className="text-xs text-quaternary-100">{state.message}</p>;
  }

  if (state.status === "success") {
    return (
      <div className="space-y-1 text-xs leading-relaxed text-text-muted">
        <p className="font-semibold text-text">Mesure HU</p>
        <p>Moyenne : {formatHuValue(state.result.hu.mean)}</p>
        <p>Médiane : {formatHuValue(state.result.hu.median)}</p>
        <p>
          Min / Max : {formatHuValue(state.result.hu.min)} / {formatHuValue(state.result.hu.max)}
        </p>
        <p>Surface : {Math.round(state.result.area_mm2)} mm2</p>
      </div>
    );
  }

  return (
    <p className="text-xs leading-relaxed text-text-muted">
      {activeTool === "hu"
        ? "Cliquez dans une vue pour placer la ROI HU."
        : "Activez l'outil HU ROI depuis la toolbar."}
    </p>
  );
}

export function RightSegmentationPanel({
  activeTool,
  aiUnavailableMessage,
  canRunAi,
  huMeasurementState,
  isAiPredicting,
  isBusy,
  isMaskVisible,
  maskLabels,
  maskLabelsMessage,
  maskOpacity,
  maskOverlayStatus,
  onCenterMaskLabel,
  onMaskOpacityChange,
  onRunAiPrediction,
  onSetAllLabelsVisible,
  onSetGroupVisible,
  onShowOnlyGroup,
  onToggleMask,
  onToggleMaskLabel,
  onUploadSegmentation,
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
        <button
          className={cn(
            "h-9 w-full rounded border text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
            canRunAi
              ? "border-primary/60 bg-primary/20 text-primary-100 hover:border-primary"
              : "border-border-soft bg-surface-100 text-text-muted",
          )}
          disabled={!canRunAi || isBusy}
          onClick={onRunAiPrediction}
          type="button"
        >
          {isAiPredicting ? "Prédiction en cours..." : "Lancer prediction IA"}
        </button>
        {aiUnavailableMessage ? (
          <p className="mt-2 text-xs leading-relaxed text-quaternary-100">{aiUnavailableMessage}</p>
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

      <PanelSection title="HU ROI">
        <HuMeasurementSummary activeTool={activeTool} state={huMeasurementState} />
      </PanelSection>
    </aside>
  );
}
