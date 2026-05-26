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
// Created     : Tuesday May 26 2026
//
// =============================================================

export type AnalysisStatus = "succeeded" | "failed" | "running" | "pending" | string;

export type AnalysisCreate = {
  module_id: "segmentation_label_hu_statistics" | string;
  segmentation_id: string;
  label_ids?: number[] | null;
  roi_mode: "whole_label" | string;
};

export type AnalysisInput = {
  volume_path: string;
  segmentation_id: string;
  segmentation_path: string;
  label_ids: number[] | null;
  roi_mode: string;
};

export type AnalysisArtifact = {
  type: string;
  name: string;
  relative_path: string;
  url: string;
};

export type AnalysisOutput = {
  result_path: string;
  artifacts: AnalysisArtifact[];
};

export type Analysis = {
  id: string;
  study_id: string;
  module_id: string;
  status: AnalysisStatus;
  created_at: string;
  updated_at: string;
  input: AnalysisInput;
  output: AnalysisOutput | null;
  error: string | null;
};

export type AnalysisListResponse = {
  items: Analysis[];
};

export type LabelHuStats = {
  mean: number | null;
  median: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  p1: number | null;
  p5: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
  p99: number | null;
};

export type AnalysisLabelResult = {
  label_id: number;
  name: string;
  voxel_count: number;
  volume_mm3: number;
  hu: LabelHuStats;
};

export type AnalysisResult = {
  id: string;
  study_id: string;
  module_id: string;
  segmentation_id: string;
  roi_mode: string;
  labels_count: number;
  labels: AnalysisLabelResult[];
};
