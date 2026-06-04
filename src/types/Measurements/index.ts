// =============================================================
//
// ██╗  ██╗███████╗██╗  ██╗██╗ █████╗
// ██║  ██║██╔════╝██║ ██╔╝██║██╔══██╗
// ███████║█████╗  █████╔╝ ██║███████║
// ██╔══██║██╔══╝  ██╔═██╗ ██║██╔══██║
// ██║  ██║███████╗██║  ██╗██║██║  ██║
// ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
//
// File        : index.ts
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

export type MeasurementPlane = "axial" | "sagittal" | "coronal";

export type HuCircleMeasurementCreate = {
  plane: MeasurementPlane;
  center_world: number[];
  edge_world?: number[] | null;
  radius_mm?: number | null;
};

export type HuCircleStats = {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  p5: number;
  p95: number;
};

export type HuCircleMeasurement = {
  plane: MeasurementPlane;
  center_world: number[];
  radius_mm: number;
  voxel_count: number;
  area_mm2: number;
  hu: HuCircleStats;
};
