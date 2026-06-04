// =============================================================
//
// File        : index.tsx
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import CenterFocusStrongRoundedIcon from "@mui/icons-material/CenterFocusStrongRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";

import { cn } from "~/helpers/Cn";
import {
  formatCircleDetails,
  formatMeasurementValue,
  getMeasurementTitle,
} from "../../measurements/measurementGeometry";
import type { MedicalMeasurement } from "../../measurements/measurementTypes";

type MeasurementsPanelProps = {
  measurements: MedicalMeasurement[];
  selectedMeasurementId: string | null;
  onDeleteMeasurement: (measurementId: string) => void;
  onFocusMeasurement: (measurement: MedicalMeasurement) => void;
  onResetMeasurements: () => void;
  onSelectMeasurement: (measurementId: string | null) => void;
};

function getMeasurementDetails(measurement: MedicalMeasurement) {
  if (measurement.type === "circle_roi") {
    return formatCircleDetails(measurement);
  }

  if (measurement.type === "hu_probe") {
    return measurement.pointVoxel
      ? `voxel ${measurement.pointVoxel.map((value) => Math.round(value)).join(", ")}`
      : "voxel unavailable";
  }

  return `slice ${measurement.sliceIndex + 1}`;
}

export function MeasurementsPanel({
  measurements,
  onDeleteMeasurement,
  onFocusMeasurement,
  onResetMeasurements,
  onSelectMeasurement,
  selectedMeasurementId,
}: MeasurementsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          {measurements.length ? `${measurements.length} mesure(s)` : "Aucune mesure"}
        </p>
        <button
          className="inline-flex h-7 items-center gap-1 rounded border border-border-soft bg-surface-100 px-2 text-[11px] font-semibold text-text-soft transition hover:border-quaternary-600 hover:text-quaternary-100 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!measurements.length}
          onClick={onResetMeasurements}
          title="Reset measurements"
          type="button"
        >
          <RestartAltRoundedIcon fontSize="inherit" />
          Reset
        </button>
      </div>

      {measurements.length ? (
        <div className="space-y-2">
          {measurements.map((measurement) => {
            const isSelected = selectedMeasurementId === measurement.id;

            return (
              <div
                className={cn(
                  "w-full rounded border bg-surface-100 p-2 text-left text-xs transition",
                  isSelected
                    ? "border-primary/70 text-text"
                    : "border-border-soft text-text-soft hover:border-primary/45",
                )}
                key={measurement.id}
                onClick={() => onSelectMeasurement(measurement.id)}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-text">
                      {getMeasurementTitle(measurement)}
                    </p>
                    <p className="mt-0.5 text-text-muted">
                      {measurement.viewportPlane} - {formatMeasurementValue(measurement)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-text-muted">
                      {getMeasurementDetails(measurement)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: measurement.color }}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="inline-flex h-7 items-center gap-1 rounded border border-border-soft px-2 text-[11px] font-semibold text-text-soft transition hover:border-primary/60 hover:text-text"
                    onClick={(event) => {
                      event.stopPropagation();
                      onFocusMeasurement(measurement);
                    }}
                    title="Focus measurement"
                    type="button"
                  >
                    <CenterFocusStrongRoundedIcon fontSize="inherit" />
                    Focus
                  </button>
                  <button
                    className="inline-flex h-7 items-center gap-1 rounded border border-border-soft px-2 text-[11px] font-semibold text-text-soft transition hover:border-quaternary-600 hover:text-quaternary-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteMeasurement(measurement.id);
                    }}
                    title="Delete measurement"
                    type="button"
                  >
                    <DeleteRoundedIcon fontSize="inherit" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs leading-relaxed text-text-muted">
          Activez Distance, HU Probe ou Circle ROI puis cliquez dans une vue MPR.
        </p>
      )}
    </div>
  );
}
