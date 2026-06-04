// =============================================================
//
// File        : measurementGeometry.ts
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import type { MeasurementPlane } from "~/types/Measurements";
import type {
  CircleRoiMeasurement,
  LengthMeasurement,
  MeasurementPoint,
  MedicalMeasurement,
} from "./measurementTypes";

export type VoxelLike = {
  i: number;
  j: number;
  k: number;
};

export type PlaneAxes = {
  fixedAxis: 0 | 1 | 2;
  uAxis: 0 | 1 | 2;
  vAxis: 0 | 1 | 2;
};

export type CircleRoiStats = {
  meanHu: number | null;
  minHu: number | null;
  maxHu: number | null;
  stdHu: number | null;
  voxelCount: number;
};

export function toMeasurementPoint(values: number[]): MeasurementPoint {
  return [
    Number(values[0]) || 0,
    Number(values[1]) || 0,
    Number(values[2]) || 0,
  ];
}

export function voxelToMeasurementPoint(voxel: VoxelLike): MeasurementPoint {
  return [voxel.i, voxel.j, voxel.k];
}

export function measurementPointToVoxel(point: MeasurementPoint): VoxelLike {
  return {
    i: point[0],
    j: point[1],
    k: point[2],
  };
}

export function getPlaneAxes(plane: MeasurementPlane): PlaneAxes {
  if (plane === "axial") {
    return { fixedAxis: 2, uAxis: 0, vAxis: 1 };
  }

  if (plane === "sagittal") {
    return { fixedAxis: 0, uAxis: 1, vAxis: 2 };
  }

  return { fixedAxis: 1, uAxis: 0, vAxis: 2 };
}

export function getSliceIndexForVoxel(voxel: VoxelLike, plane: MeasurementPlane) {
  if (plane === "axial") {
    return Math.round(voxel.k);
  }

  if (plane === "sagittal") {
    return Math.round(voxel.i);
  }

  return Math.round(voxel.j);
}

export function getWorldDistanceMm(
  firstPoint: MeasurementPoint,
  secondPoint: MeasurementPoint,
) {
  const dx = firstPoint[0] - secondPoint[0];
  const dy = firstPoint[1] - secondPoint[1];
  const dz = firstPoint[2] - secondPoint[2];

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function getVoxelDistanceMm(
  firstPoint: MeasurementPoint,
  secondPoint: MeasurementPoint,
  spacing: number[] | undefined,
) {
  const sx = spacing?.[0] || 1;
  const sy = spacing?.[1] || 1;
  const sz = spacing?.[2] || 1;
  const dx = (firstPoint[0] - secondPoint[0]) * sx;
  const dy = (firstPoint[1] - secondPoint[1]) * sy;
  const dz = (firstPoint[2] - secondPoint[2]) * sz;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function getLengthMm({
  pointsVoxel,
  pointsWorld,
  spacing,
}: {
  pointsWorld: [MeasurementPoint, MeasurementPoint];
  pointsVoxel?: [MeasurementPoint, MeasurementPoint];
  spacing?: number[];
}) {
  const worldDistance = getWorldDistanceMm(pointsWorld[0], pointsWorld[1]);

  if (Number.isFinite(worldDistance) && worldDistance > 0) {
    return worldDistance;
  }

  if (pointsVoxel) {
    return getVoxelDistanceMm(pointsVoxel[0], pointsVoxel[1], spacing);
  }

  return 0;
}

export function getPlaneRadiusMm({
  centerVoxel,
  edgeVoxel,
  plane,
  spacing,
  worldRadiusMm,
}: {
  centerVoxel?: MeasurementPoint;
  edgeVoxel?: MeasurementPoint;
  plane: MeasurementPlane;
  spacing?: number[];
  worldRadiusMm?: number;
}) {
  if (worldRadiusMm && Number.isFinite(worldRadiusMm) && worldRadiusMm > 0) {
    return worldRadiusMm;
  }

  if (!centerVoxel || !edgeVoxel) {
    return 0;
  }

  const axes = getPlaneAxes(plane);
  const sx = spacing?.[axes.uAxis] || 1;
  const sy = spacing?.[axes.vAxis] || 1;
  const du = (centerVoxel[axes.uAxis] - edgeVoxel[axes.uAxis]) * sx;
  const dv = (centerVoxel[axes.vAxis] - edgeVoxel[axes.vAxis]) * sy;

  return Math.sqrt(du * du + dv * dv);
}

export function calculateCircleRoiStats({
  centerVoxel,
  plane,
  radiusMm,
  readHu,
  shape,
  spacing,
}: {
  centerVoxel: MeasurementPoint;
  plane: MeasurementPlane;
  radiusMm: number;
  readHu: (voxel: VoxelLike) => number | null;
  shape: { i: number; j: number; k: number };
  spacing?: number[];
}): CircleRoiStats {
  const axes = getPlaneAxes(plane);
  const fixedIndex = Math.round(centerVoxel[axes.fixedAxis]);
  const centerU = centerVoxel[axes.uAxis];
  const centerV = centerVoxel[axes.vAxis];
  const spacingU = spacing?.[axes.uAxis] || 1;
  const spacingV = spacing?.[axes.vAxis] || 1;
  const radiusU = Math.max(1, Math.ceil(radiusMm / spacingU));
  const radiusV = Math.max(1, Math.ceil(radiusMm / spacingV));
  const values: number[] = [];
  const shapeByAxis = [shape.i, shape.j, shape.k];
  const minU = Math.max(0, Math.floor(centerU - radiusU));
  const maxU = Math.min(shapeByAxis[axes.uAxis] - 1, Math.ceil(centerU + radiusU));
  const minV = Math.max(0, Math.floor(centerV - radiusV));
  const maxV = Math.min(shapeByAxis[axes.vAxis] - 1, Math.ceil(centerV + radiusV));

  for (let u = minU; u <= maxU; u += 1) {
    for (let v = minV; v <= maxV; v += 1) {
      const distanceU = (u - centerU) * spacingU;
      const distanceV = (v - centerV) * spacingV;

      if (Math.sqrt(distanceU * distanceU + distanceV * distanceV) > radiusMm) {
        continue;
      }

      const ijk = [0, 0, 0];
      ijk[axes.fixedAxis] = fixedIndex;
      ijk[axes.uAxis] = u;
      ijk[axes.vAxis] = v;

      const value = readHu({
        i: ijk[0],
        j: ijk[1],
        k: ijk[2],
      });

      if (value == null || !Number.isFinite(value)) {
        continue;
      }

      values.push(value);
    }
  }

  if (!values.length) {
    return {
      maxHu: null,
      meanHu: null,
      minHu: null,
      stdHu: null,
      voxelCount: 0,
    };
  }

  let min = values[0];
  let max = values[0];
  const sum = values.reduce((acc, value) => {
    if (value < min) {
      min = value;
    }

    if (value > max) {
      max = value;
    }

    return acc + value;
  }, 0);
  const mean = sum / values.length;
  const variance =
    values.reduce((acc, value) => acc + (value - mean) * (value - mean), 0) / values.length;

  return {
    maxHu: max,
    meanHu: mean,
    minHu: min,
    stdHu: Math.sqrt(variance),
    voxelCount: values.length,
  };
}

export function formatMeasurementValue(measurement: MedicalMeasurement) {
  if (measurement.type === "length") {
    return `${measurement.lengthMm.toFixed(1)} mm`;
  }

  if (measurement.type === "hu_probe") {
    return measurement.hu == null ? "HU unavailable" : `${Math.round(measurement.hu)} HU`;
  }

  if (measurement.meanHu == null) {
    return "Mean HU unavailable";
  }

  return `Mean ${Math.round(measurement.meanHu)} HU`;
}

export function getMeasurementTitle(measurement: MedicalMeasurement) {
  if (measurement.type === "length") {
    return "Length";
  }

  if (measurement.type === "hu_probe") {
    return "HU Probe";
  }

  return "Circle ROI";
}

export function getMeasurementPrimaryPoint(measurement: MedicalMeasurement) {
  if (measurement.type === "length") {
    const midpointWorld: MeasurementPoint = [
      (measurement.pointsWorld[0][0] + measurement.pointsWorld[1][0]) / 2,
      (measurement.pointsWorld[0][1] + measurement.pointsWorld[1][1]) / 2,
      (measurement.pointsWorld[0][2] + measurement.pointsWorld[1][2]) / 2,
    ];

    if (!measurement.pointsVoxel) {
      return { world: midpointWorld };
    }

    return {
      voxel: [
        (measurement.pointsVoxel[0][0] + measurement.pointsVoxel[1][0]) / 2,
        (measurement.pointsVoxel[0][1] + measurement.pointsVoxel[1][1]) / 2,
        (measurement.pointsVoxel[0][2] + measurement.pointsVoxel[1][2]) / 2,
      ] as MeasurementPoint,
      world: midpointWorld,
    };
  }

  if (measurement.type === "hu_probe") {
    return {
      voxel: measurement.pointVoxel,
      world: measurement.pointWorld,
    };
  }

  return {
    voxel: measurement.centerVoxel,
    world: measurement.centerWorld,
  };
}

export function formatCircleDetails(measurement: CircleRoiMeasurement) {
  const std = measurement.stdHu == null ? "-" : Math.round(measurement.stdHu);
  const min = measurement.minHu == null ? "-" : Math.round(measurement.minHu);
  const max = measurement.maxHu == null ? "-" : Math.round(measurement.maxHu);

  return `std ${std}, min ${min}, max ${max}, n=${measurement.voxelCount}`;
}

export function formatLengthDetails(measurement: LengthMeasurement) {
  return `${measurement.lengthMm.toFixed(2)} mm`;
}
