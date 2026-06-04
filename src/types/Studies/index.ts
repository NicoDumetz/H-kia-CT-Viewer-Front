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

export type StudyStatus = "imported" | "preparing" | "prepared" | "failed";
export type StudyInputType = "dicom" | "dicomdir" | "nifti" | "unknown";

export type StudyFile = {
  filename: string;
  relative_path: string;
  size_bytes?: number;
};

export type Study = {
  id: string;
  status: StudyStatus;
  input_type: StudyInputType;
  files_count: number;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  error?: string | null;
  source_files?: StudyFile[];
  prepared_volume?: {
    filename: string;
    relative_path: string;
    metadata_path: string;
  };
};

export type StudyListResponse = {
  items: Study[];
};

export type StudyImportResponse = Study;

export type VolumeIntensity = {
  min: number;
  max: number;
  mean: number;
  median: number;
  p1: number;
  p5: number;
  p95: number;
  p99: number;
};

export type VolumeMetadata = {
  shape: number[];
  spacing: number[];
  origin?: number[] | null;
  direction?: number[] | null;
  affine?: number[][] | null;
  intensity: VolumeIntensity;
  source_type?: "nifti" | "dicom" | string;
  prepared_at?: string;
  selected_series_instance_uid?: string | null;
  selected_series_description?: string | null;
  selected_protocol_name?: string | null;
  selected_modality?: string | null;
  selected_files_count?: number | null;
};

export type PreparedVolume = {
  filename: string;
  relative_path: string;
  url: string;
  metadata: VolumeMetadata;
};

export type StudyVolumeResponse = {
  study_id: string;
  status: string;
  volume: PreparedVolume;
};

export type StudyPrepareResponse = StudyVolumeResponse;

export type ViewerNifti = {
  filename: string;
  relative_path: string;
  url: string;
  metadata: {
    shape: number[];
    spacing: number[];
  };
};

export type ViewerDicomImage = {
  filename: string;
  relative_path: string;
  url: string;
  image_id: string;
  instance_number?: number | null;
  slice_location?: number | null;
  image_position_patient?: number[] | null;
};

export type ViewerDicomSeries = {
  series_instance_uid: string | null;
  study_instance_uid?: string | null;
  modality?: string | null;
  series_description?: string | null;
  protocol_name?: string | null;
  manufacturer?: string | null;
  files_count: number;
  rows?: number | null;
  columns?: number | null;
  slice_thickness?: number | null;
  pixel_spacing?: number[] | null;
  images: ViewerDicomImage[];
};

export type ViewerDicom = {
  series: ViewerDicomSeries[];
};

export type StudyViewerResponse = {
  study_id: string;
  input_type: StudyInputType;
  status: string;
  nifti: ViewerNifti | null;
  dicom: ViewerDicom | null;
};
