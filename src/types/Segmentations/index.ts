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

export type SegmentationFile = {
  filename: string;
  relative_path: string;
  url: string;
};

export type SegmentationSource = "ai" | "manual";
export type SegmentationStatus = "ready" | "rejected" | "failed";

export type SegmentationBBox = {
  min: number[];
  max: number[];
};

export type SegmentationLabel = {
  id: number;
  label_id: number;
  name: string;
  group: string;
  present: boolean;
  voxel_count: number;
  volume_mm3: number;
  color: string;
  opacity: number;
  bbox_ijk: SegmentationBBox | null;
  center_ijk: number[] | null;
};

export type SegmentationMetadata = {
  shape: number[];
  spacing: number[];
  labels_count: number;
  present_labels_count: number;
  labels_path?: string | null;
  labels_url?: string | null;
  labels: SegmentationLabel[];
};

export type SegmentationLabelsDocument = {
  segmentation_id: string;
  source: SegmentationSource;
  model_id: string | null;
  labels_count: number;
  present_labels_count: number;
  labels: SegmentationLabel[];
};

export type Segmentation = {
  id: string;
  study_id: string;
  source: SegmentationSource;
  source_run_id: string | null;
  module_id: string;
  module_name?: string;
  model_id?: string | null;
  status: SegmentationStatus | string;
  created_at: string;
  file: SegmentationFile;
  labels_file?: SegmentationFile | null;
  metadata: SegmentationMetadata;
};

export type SegmentationListResponse = {
  items: Segmentation[];
};
