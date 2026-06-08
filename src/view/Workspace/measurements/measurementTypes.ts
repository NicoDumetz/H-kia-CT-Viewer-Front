// =============================================================
//
// File        : measurementTypes.ts
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import type { MeasurementPlane } from "~/types/Measurements";

export type MeasurementTool = "length" | "hu_probe" | "circle_roi";

export type MeasurementPoint = [number, number, number];

export type MeasurementBase = {
  id: string;
  studyId: string;
  viewportPlane: MeasurementPlane;
  sliceIndex: number;
  createdAt: string;
  color: string;
  label?: string;
};

export type LengthMeasurement = MeasurementBase & {
  type: "length";
  pointsWorld: [MeasurementPoint, MeasurementPoint];
  pointsVoxel?: [MeasurementPoint, MeasurementPoint];
  lengthMm: number;
};

export type HuProbeMeasurement = MeasurementBase & {
  type: "hu_probe";
  pointWorld: MeasurementPoint;
  pointVoxel?: MeasurementPoint;
  hu: number | null;
};

export type CircleRoiMeasurement = MeasurementBase & {
  type: "circle_roi";
  centerWorld: MeasurementPoint;
  edgeWorld?: MeasurementPoint;
  centerVoxel?: MeasurementPoint;
  edgeVoxel?: MeasurementPoint;
  radiusMm: number;
  radiusVoxel?: number;
  meanHu: number | null;
  minHu: number | null;
  maxHu: number | null;
  stdHu: number | null;
  voxelCount: number;
};

export type MedicalMeasurement =
  | LengthMeasurement
  | HuProbeMeasurement
  | CircleRoiMeasurement;

export type MeasurementDraft =
  | {
      type: "length";
      viewportPlane: MeasurementPlane;
      sliceIndex: number;
      startWorld: MeasurementPoint;
      endWorld: MeasurementPoint;
      startVoxel?: MeasurementPoint;
      endVoxel?: MeasurementPoint;
    }
  | {
      type: "circle_roi";
      viewportPlane: MeasurementPlane;
      sliceIndex: number;
      centerWorld: MeasurementPoint;
      edgeWorld: MeasurementPoint;
      centerVoxel?: MeasurementPoint;
      edgeVoxel?: MeasurementPoint;
      radiusMm: number;
    };

export type MeasurementPrimaryPoint = {
  world?: MeasurementPoint;
  voxel?: MeasurementPoint;
};
