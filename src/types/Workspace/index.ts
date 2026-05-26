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

import type { Analysis } from "~/types/Analyses";
import type { AiModule, AiRun } from "~/types/Ai";
import type { Segmentation } from "~/types/Segmentations";
import type { StudyViewerResponse, StudyVolumeResponse } from "~/types/Studies";

export type WorkspaceStudy = {
  id: string;
  status: string;
  input_type: string;
  files_count: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceVolume = {
  is_prepared: boolean;
  data: StudyVolumeResponse | null;
};

export type WorkspaceAi = {
  modules: AiModule[];
  runs: AiRun[];
};

export type WorkspaceCollection<T> = {
  items: T[];
  latest: T | null;
};

export type WorkspaceAvailableActions = {
  can_prepare_volume: boolean;
  can_create_ai_run: boolean;
  can_execute_ai: boolean;
  can_publish_segmentation: boolean;
  can_run_label_hu_statistics: boolean;
};

export type StudyWorkspace = {
  study: WorkspaceStudy;
  viewer: StudyViewerResponse | null | Record<string, unknown>;
  volume: WorkspaceVolume;
  ai: WorkspaceAi;
  segmentations: WorkspaceCollection<Segmentation>;
  analyses: WorkspaceCollection<Analysis>;
  available_actions: WorkspaceAvailableActions;
};
