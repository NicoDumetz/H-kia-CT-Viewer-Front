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

import { API_BASE_URL } from "~/constants/app";
import Api from "~/helpers/api/index";
import type { ApiRequest } from "~/types/api";
import type {
  Study,
  StudyImportResponse,
  StudyListResponse,
  StudyViewerResponse,
  StudyVolumeResponse,
} from "~/types/Studies";

export class Studies {
  static endpoint = "/studies";

  static health(): ApiRequest<{ status: string }> {
    return Api.get<{ status: string }>("/health", { withAuth: false });
  }

  static importStudy(files: File[]): ApiRequest<StudyImportResponse> {
    const formData = new FormData();

    files.forEach((file) => {
      formData.append("files", file);
    });

    return Api.post<StudyImportResponse, FormData>(`${Studies.endpoint}/import`, formData);
  }

  static getStudies(): ApiRequest<StudyListResponse> {
    return Api.get<StudyListResponse>(Studies.endpoint);
  }

  static getStudy(studyId: string): ApiRequest<Study> {
    return Api.get<Study>(`${Studies.endpoint}/${encodeURIComponent(studyId)}`);
  }

  static getViewer(studyId: string): ApiRequest<StudyViewerResponse> {
    return Api.get<StudyViewerResponse>(
      `${Studies.endpoint}/${encodeURIComponent(studyId)}/viewer`,
    );
  }

  static prepareStudy(studyId: string): ApiRequest<Study> {
    return Api.post<Study>(`${Studies.endpoint}/${encodeURIComponent(studyId)}/prepare`);
  }

  static getVolume(studyId: string): ApiRequest<StudyVolumeResponse> {
    return Api.get<StudyVolumeResponse>(
      `${Studies.endpoint}/${encodeURIComponent(studyId)}/volume`,
    );
  }

  static getFileUrl(studyId: string, relativePath: string): string {
    const encodedStudyId = encodeURIComponent(studyId);
    const encodedPath = relativePath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const filePath = `${Studies.endpoint}/${encodedStudyId}/files/${encodedPath}`;

    return `${API_BASE_URL}${filePath}`;
  }
}
