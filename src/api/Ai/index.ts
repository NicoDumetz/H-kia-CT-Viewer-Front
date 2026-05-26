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

import Api from "~/helpers/api/index";
import type {
  AiModuleListResponse,
  AiRun,
  AiRunCreate,
  AiRunListResponse,
} from "~/types/Ai";
import type { ApiRequest } from "~/types/api";
import type { Segmentation } from "~/types/Segmentations";

export class Ai {
  static endpoint = "/ai";

  static getModules(): ApiRequest<AiModuleListResponse> {
    return Api.get<AiModuleListResponse>(`${Ai.endpoint}/modules`);
  }

  static createRun(studyId: string, payload: AiRunCreate): ApiRequest<AiRun> {
    return Api.post<AiRun, AiRunCreate>(
      `/studies/${encodeURIComponent(studyId)}/ai-runs`,
      payload,
    );
  }

  static getRuns(studyId: string): ApiRequest<AiRunListResponse> {
    return Api.get<AiRunListResponse>(`/studies/${encodeURIComponent(studyId)}/ai-runs`);
  }

  static getRun(studyId: string, runId: string): ApiRequest<AiRun> {
    return Api.get<AiRun>(
      `/studies/${encodeURIComponent(studyId)}/ai-runs/${encodeURIComponent(runId)}`,
    );
  }

  static simulateRun(studyId: string, runId: string): ApiRequest<AiRun> {
    return Api.post<AiRun>(
      `/studies/${encodeURIComponent(studyId)}/ai-runs/${encodeURIComponent(runId)}/simulate`,
    );
  }

  static executeRun(studyId: string, runId: string): ApiRequest<AiRun> {
    return Api.post<AiRun>(
      `/studies/${encodeURIComponent(studyId)}/ai-runs/${encodeURIComponent(runId)}/execute`,
    );
  }

  static publishSegmentation(studyId: string, runId: string): ApiRequest<Segmentation> {
    return Api.post<Segmentation>(
      `/studies/${encodeURIComponent(studyId)}/ai-runs/${encodeURIComponent(runId)}/publish-segmentation`,
    );
  }
}
