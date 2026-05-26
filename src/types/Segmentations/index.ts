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

export type SegmentationBBox = {
  min: number[];
  max: number[];
};

export type SegmentationLabel = {
  label_id: number;
  name: string;
  voxel_count: number;
  volume_mm3: number;
  bbox_ijk: SegmentationBBox | null;
  center_ijk: number[] | null;
};

export type SegmentationMetadata = {
  shape: number[];
  spacing: number[];
  labels_count: number;
  labels: SegmentationLabel[];
};

export type Segmentation = {
  id: string;
  study_id: string;
  source_run_id: string;
  module_id: string;
  module_name?: string;
  status: "ready" | string;
  created_at: string;
  file: SegmentationFile;
  metadata: SegmentationMetadata;
};

export type SegmentationListResponse = {
  items: Segmentation[];
};
