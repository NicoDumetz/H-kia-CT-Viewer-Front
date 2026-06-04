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

import { Button } from "~/components/Button";
import { cn } from "~/helpers/Cn";

export type MaskLabelState = {
  labelId: number;
  name: string;
  color: string;
  isVisible: boolean;
  voxelCount: number;
  volumeMm3: number;
  centerIjk?: number[] | null;
  isSelected?: boolean;
};

type MaskLabelsPanelProps = {
  labels: MaskLabelState[];
  opacity: number;
  overlayStatus: "available" | "unavailable" | "loading";
  onToggleLabel: (labelId: number) => void;
  onOpacityChange: (opacity: number) => void;
  onCenterLabel: (labelId: number) => void;
};

function formatVolume(volumeMm3: number) {
  if (!Number.isFinite(volumeMm3)) {
    return "-";
  }

  return `${Math.round(volumeMm3).toLocaleString("fr-FR")} mm3`;
}

export function MaskLabelsPanel({
  labels,
  opacity,
  overlayStatus,
  onCenterLabel,
  onOpacityChange,
  onToggleLabel,
}: MaskLabelsPanelProps) {
  const opacityPercent = Math.round(opacity * 100);

  return (
    <div className="rounded border border-border-soft bg-surface-100 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-text">Masque</p>
          <p className="text-xs text-text-muted">
            {labels.length ? `${labels.length} labels` : "Aucun label"}
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <span>Remplissage</span>
          <input
            className="h-1.5 w-20 accent-primary"
            max={1}
            min={0.1}
            onChange={(event) => onOpacityChange(Number(event.target.value))}
            step={0.05}
            type="range"
            value={opacity}
          />
          <span className="w-8 text-right text-text-soft">{opacityPercent}%</span>
        </label>
      </div>

      <p className="mb-3 text-xs text-text-muted">
        Les contours restent lisibles quand l'opacité du remplissage baisse.
      </p>

      {overlayStatus === "loading" ? (
        <p className="mb-3 rounded border border-border-soft bg-black/20 px-2 py-1 text-xs text-text-muted">
          Chargement de l'overlay masque...
        </p>
      ) : null}

      {overlayStatus === "unavailable" ? (
        <p className="mb-3 rounded border border-quaternary-700 bg-quaternary-700/15 px-2 py-1 text-xs text-quaternary-100">
          Overlay non encore disponible dans le viewer.
        </p>
      ) : null}

      {labels.length ? (
        <div className="space-y-2">
          {labels.map((label) => (
            <div
              className={cn(
                "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded border border-border-soft bg-surface px-2 py-2",
                label.isSelected && "border-primary/80 bg-primary/10",
              )}
              key={label.labelId}
            >
              <input
                aria-label={`Afficher ${label.name}`}
                checked={label.isVisible}
                className="h-4 w-4 accent-primary"
                onChange={() => onToggleLabel(label.labelId)}
                type="checkbox"
              />
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-sm border border-white/30"
                style={{ backgroundColor: label.color }}
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-text">{label.name}</p>
                <p className="text-[11px] text-text-muted">{formatVolume(label.volumeMm3)}</p>
              </div>
              <Button
                className="h-7 px-2 text-[11px]"
                onClick={() => onCenterLabel(label.labelId)}
                size="sm"
                variant="ghost"
              >
                Centrer
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-text-muted">
          Importez une segmentation pour voir les labels détectés.
        </p>
      )}
    </div>
  );
}
