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

export type AiModuleRunner = "nnunet" | "internal";
export type AiTaskType = "segmentation" | "measurement" | "quality_control" | string;
export type AiRunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type AiModule = {
  id: string;
  name: string;
  task_type: AiTaskType;
  description: string;
  input_type: string;
  output_type: string;
  is_available: boolean;
  runner: AiModuleRunner | string;
  labels: Record<string, string> | null;
};

export type AiModuleListResponse = {
  items: AiModule[];
};

export type AiRunCreate = {
  module_id: string;
};

export type AiRunInput = {
  prepared_volume_path?: string;
  [key: string]: unknown;
};

export type AiRunArtifact = {
  type: string;
  name: string;
  relative_path: string;
  url: string;
};

export type AiRunOutput = {
  result_path?: string;
  artifacts: AiRunArtifact[];
};

export type AiRun = {
  id: string;
  study_id: string;
  module_id: string;
  module_name: string;
  status: AiRunStatus;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  input: AiRunInput;
  output: AiRunOutput | null;
  error: string | null;
};

export type AiRunListResponse = {
  items: AiRun[];
};
