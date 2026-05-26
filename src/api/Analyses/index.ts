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
  Analysis,
  AnalysisCreate,
  AnalysisListResponse,
  AnalysisResult,
} from "~/types/Analyses";
import type { ApiRequest } from "~/types/api";

export class Analyses {
  static createAnalysis(studyId: string, payload: AnalysisCreate): ApiRequest<Analysis> {
    return Api.post<Analysis, AnalysisCreate>(
      `/studies/${encodeURIComponent(studyId)}/analyses`,
      payload,
    );
  }

  static getAnalyses(studyId: string): ApiRequest<AnalysisListResponse> {
    return Api.get<AnalysisListResponse>(`/studies/${encodeURIComponent(studyId)}/analyses`);
  }

  static getAnalysis(studyId: string, analysisId: string): ApiRequest<Analysis> {
    return Api.get<Analysis>(
      `/studies/${encodeURIComponent(studyId)}/analyses/${encodeURIComponent(analysisId)}`,
    );
  }

  static getAnalysisResult(studyId: string, analysisId: string): ApiRequest<AnalysisResult> {
    return Api.get<AnalysisResult>(
      `/studies/${encodeURIComponent(studyId)}/analyses/${encodeURIComponent(analysisId)}/result`,
    );
  }
}
