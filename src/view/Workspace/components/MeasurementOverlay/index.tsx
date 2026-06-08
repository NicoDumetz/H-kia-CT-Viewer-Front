// =============================================================
//
// File        : index.tsx
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import type { MeasurementPlane } from "~/types/Measurements";
import {
  formatMeasurementValue,
  getMeasurementTitle,
} from "../../measurements/measurementGeometry";
import type {
  MeasurementDraft,
  MeasurementPoint,
  MedicalMeasurement,
} from "../../measurements/measurementTypes";

type ProjectedPoint = {
  x: number;
  y: number;
};

type MeasurementOverlayProps = {
  canSelect: boolean;
  draft: MeasurementDraft | null;
  measurements: MedicalMeasurement[];
  plane: MeasurementPlane;
  projectVoxelToCanvas: (point: MeasurementPoint) => ProjectedPoint | null;
  projectWorldToCanvas: (point: MeasurementPoint) => ProjectedPoint | null;
  renderTick?: number;
  selectedMeasurementId: string | null;
  sliceIndex: number;
  sliceTolerance?: number;
  onSelectMeasurement: (measurementId: string) => void;
};

function isMeasurementVisible(
  measurement: MedicalMeasurement,
  plane: MeasurementPlane,
  sliceIndex: number,
  sliceTolerance: number,
) {
  return (
    measurement.viewportPlane === plane &&
    Math.abs(measurement.sliceIndex - sliceIndex) <= sliceTolerance
  );
}

function isValidProjectedPoint(point: ProjectedPoint | null) {
  return Boolean(
    point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y),
  );
}

function projectMedicalPoint({
  projectVoxelToCanvas,
  projectWorldToCanvas,
  voxel,
  world,
}: {
  projectVoxelToCanvas: (point: MeasurementPoint) => ProjectedPoint | null;
  projectWorldToCanvas: (point: MeasurementPoint) => ProjectedPoint | null;
  voxel?: MeasurementPoint;
  world?: MeasurementPoint;
}) {
  const worldPoint = world ? projectWorldToCanvas(world) : null;

  if (isValidProjectedPoint(worldPoint)) {
    return worldPoint;
  }

  const voxelPoint = voxel ? projectVoxelToCanvas(voxel) : null;

  return isValidProjectedPoint(voxelPoint) ? voxelPoint : null;
}

function getCircleRadius(
  center: ProjectedPoint | null,
  edge: ProjectedPoint | null,
) {
  if (!center || !edge) {
    return 0;
  }

  const dx = edge.x - center.x;
  const dy = edge.y - center.y;

  return Math.sqrt(dx * dx + dy * dy);
}

function Label({
  color,
  point,
  text,
}: {
  color: string;
  point: ProjectedPoint;
  text: string;
}) {
  return (
    <div
      className="absolute z-10 rounded border bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold leading-4 shadow-lg"
      style={{
        borderColor: color,
        color,
        left: `${point.x + 8}px`,
        maxWidth: "12rem",
        top: `${point.y - 10}px`,
      }}
    >
      {text}
    </div>
  );
}

export function MeasurementOverlay({
  canSelect,
  draft,
  measurements,
  onSelectMeasurement,
  plane,
  projectVoxelToCanvas,
  projectWorldToCanvas,
  renderTick,
  selectedMeasurementId,
  sliceIndex,
  sliceTolerance = 1,
}: MeasurementOverlayProps) {
  const visibleMeasurements = measurements.filter((measurement) =>
    isMeasurementVisible(measurement, plane, sliceIndex, sliceTolerance),
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
      data-render-tick={renderTick}
    >
      <svg className="absolute inset-0 h-full w-full">
        {visibleMeasurements.map((measurement) => {
          const isSelected = selectedMeasurementId === measurement.id;
          const color = isSelected ? "rgb(125, 211, 252)" : measurement.color;
          const commonProps = {
            className: canSelect ? "pointer-events-auto cursor-pointer" : "pointer-events-none",
            onClick: canSelect
              ? () => onSelectMeasurement(measurement.id)
              : undefined,
            stroke: color,
            strokeWidth: isSelected ? 2.5 : 1.75,
          };

          if (measurement.type === "length") {
            const start = projectMedicalPoint({
              projectVoxelToCanvas,
              projectWorldToCanvas,
              voxel: measurement.pointsVoxel?.[0],
              world: measurement.pointsWorld[0],
            });
            const end = projectMedicalPoint({
              projectVoxelToCanvas,
              projectWorldToCanvas,
              voxel: measurement.pointsVoxel?.[1],
              world: measurement.pointsWorld[1],
            });

            if (!start || !end) {
              return null;
            }

            return (
              <g key={measurement.id}>
                <line
                  {...commonProps}
                  fill="none"
                  x1={start.x}
                  x2={end.x}
                  y1={start.y}
                  y2={end.y}
                />
                <circle cx={start.x} cy={start.y} fill={color} r={3} />
                <circle cx={end.x} cy={end.y} fill={color} r={3} />
              </g>
            );
          }

          if (measurement.type === "hu_probe") {
            const point = projectMedicalPoint({
              projectVoxelToCanvas,
              projectWorldToCanvas,
              voxel: measurement.pointVoxel,
              world: measurement.pointWorld,
            });

            if (!point) {
              return null;
            }

            return (
              <g key={measurement.id}>
                <circle
                  {...commonProps}
                  cx={point.x}
                  cy={point.y}
                  fill="rgba(0, 0, 0, 0.5)"
                  r={5}
                />
                <circle cx={point.x} cy={point.y} fill={color} r={2} />
              </g>
            );
          }

          const center = projectMedicalPoint({
            projectVoxelToCanvas,
            projectWorldToCanvas,
            voxel: measurement.centerVoxel,
            world: measurement.centerWorld,
          });
          const edge = projectMedicalPoint({
            projectVoxelToCanvas,
            projectWorldToCanvas,
            voxel: measurement.edgeVoxel,
            world: measurement.edgeWorld,
          });
          const radius = getCircleRadius(center, edge);

          if (!center || radius <= 0) {
            return null;
          }

          return (
            <g key={measurement.id}>
              <circle
                {...commonProps}
                cx={center.x}
                cy={center.y}
                fill="rgba(250, 204, 21, 0.12)"
                r={radius}
              />
              <circle cx={center.x} cy={center.y} fill={color} r={3} />
            </g>
          );
        })}

        {draft?.type === "length" ? (() => {
          const start = projectMedicalPoint({
            projectVoxelToCanvas,
            projectWorldToCanvas,
            voxel: draft.startVoxel,
            world: draft.startWorld,
          });
          const end = projectMedicalPoint({
            projectVoxelToCanvas,
            projectWorldToCanvas,
            voxel: draft.endVoxel,
            world: draft.endWorld,
          });

          if (!start || !end) {
            return null;
          }

          return (
            <g>
              <line
                stroke="rgb(250, 204, 21)"
                strokeDasharray="5 4"
                strokeWidth="1.75"
                x1={start.x}
                x2={end.x}
                y1={start.y}
                y2={end.y}
              />
              <circle cx={start.x} cy={start.y} fill="rgb(250, 204, 21)" r={3} />
              <circle cx={end.x} cy={end.y} fill="rgb(250, 204, 21)" r={3} />
            </g>
          );
        })() : null}

        {draft?.type === "circle_roi" ? (() => {
          const center = projectMedicalPoint({
            projectVoxelToCanvas,
            projectWorldToCanvas,
            voxel: draft.centerVoxel,
            world: draft.centerWorld,
          });
          const edge = projectMedicalPoint({
            projectVoxelToCanvas,
            projectWorldToCanvas,
            voxel: draft.edgeVoxel,
            world: draft.edgeWorld,
          });
          const radius = getCircleRadius(center, edge);

          if (!center || radius <= 0) {
            return null;
          }

          return (
            <g>
              <circle
                cx={center.x}
                cy={center.y}
                fill="rgba(250, 204, 21, 0.12)"
                r={radius}
                stroke="rgb(250, 204, 21)"
                strokeDasharray="5 4"
                strokeWidth="1.75"
              />
              <circle cx={center.x} cy={center.y} fill="rgb(250, 204, 21)" r={3} />
            </g>
          );
        })() : null}
      </svg>

      {visibleMeasurements.map((measurement) => {
        const color = selectedMeasurementId === measurement.id
          ? "rgb(125, 211, 252)"
          : measurement.color;
        const labelPoint = (() => {
          if (measurement.type === "length") {
            const start = projectMedicalPoint({
              projectVoxelToCanvas,
              projectWorldToCanvas,
              voxel: measurement.pointsVoxel?.[0],
              world: measurement.pointsWorld[0],
            });
            const end = projectMedicalPoint({
              projectVoxelToCanvas,
              projectWorldToCanvas,
              voxel: measurement.pointsVoxel?.[1],
              world: measurement.pointsWorld[1],
            });

            if (!start || !end) {
              return null;
            }

            return {
              x: (start.x + end.x) / 2,
              y: (start.y + end.y) / 2,
            };
          }

          if (measurement.type === "hu_probe") {
            return projectMedicalPoint({
              projectVoxelToCanvas,
              projectWorldToCanvas,
              voxel: measurement.pointVoxel,
              world: measurement.pointWorld,
            });
          }

          return projectMedicalPoint({
            projectVoxelToCanvas,
            projectWorldToCanvas,
            voxel: measurement.centerVoxel,
            world: measurement.centerWorld,
          });
        })();

        if (!labelPoint) {
          return null;
        }

        return (
          <Label
            color={color}
            key={`${measurement.id}-label`}
            point={labelPoint}
            text={`${getMeasurementTitle(measurement)} ${formatMeasurementValue(measurement)}`}
          />
        );
      })}
    </div>
  );
}
