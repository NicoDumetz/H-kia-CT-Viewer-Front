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
  StudyImportSessionResponse,
  StudyImportSessionStatus,
  StudyListResponse,
  StudyPrepareResponse,
  StudyViewerResponse,
  StudyVolumeResponse,
} from "~/types/Studies";

type FileWithRelativePath = File & {
  webkitRelativePath?: string;
};

type StudyUploadResponse = StudyImportResponse | StudyPrepareResponse;

function isNiftiFile(file: File) {
  const filename = file.name.toLowerCase();

  return filename.endsWith(".nii") || filename.endsWith(".nii.gz");
}

export class Studies {
  static endpoint = "/studies";

  static health(): ApiRequest<{ status: string }> {
    return Api.get<{ status: string }>("/health", { withAuth: false });
  }

  static importStudy(files: File[]): ApiRequest<StudyImportResponse> {
    const formData = new FormData();

    files.forEach((file) => {
      const fileWithRelativePath = file as FileWithRelativePath;
      const filename = fileWithRelativePath.webkitRelativePath || file.name;

      formData.append("files", file, filename);
    });

    return Api.post<StudyImportResponse, FormData>(`${Studies.endpoint}/import`, formData);
  }

  static uploadStudy(files: File[]): ApiRequest<StudyUploadResponse> {
    if (files.length === 1 && isNiftiFile(files[0])) {
      return Studies.uploadNifti(files[0]);
    }

    return Studies.uploadDicom(files);
  }

  static uploadNifti(file: File): ApiRequest<StudyPrepareResponse> {
    const formData = new FormData();

    formData.append("file", file);

    return Api.post<StudyPrepareResponse, FormData>(
      `${Studies.endpoint}/upload-nifti`,
      formData,
    );
  }

  static uploadDicom(files: File[]): ApiRequest<StudyPrepareResponse> {
    const formData = new FormData();

    files.forEach((file) => {
      const fileWithRelativePath = file as FileWithRelativePath;
      const filename = fileWithRelativePath.webkitRelativePath || file.name;

      formData.append("files", file, filename);
    });

    return Api.post<StudyPrepareResponse, FormData>(
      `${Studies.endpoint}/upload-dicom`,
      formData,
    );
  }

  static createImportSession(): ApiRequest<StudyImportSessionResponse> {
    return Api.post<StudyImportSessionResponse>(`${Studies.endpoint}/import-sessions`);
  }

  static uploadImportSessionFiles(
    importId: string,
    files: File[],
    onProgress?: (progress: number) => void,
  ): ApiRequest<StudyImportSessionStatus> {
    const formData = new FormData();

    files.forEach((file) => {
      const fileWithRelativePath = file as FileWithRelativePath;
      const filename = fileWithRelativePath.webkitRelativePath || file.name;

      formData.append("files", file, filename);
    });

    return Api.post<StudyImportSessionStatus, FormData>(
      `${Studies.endpoint}/import-sessions/${encodeURIComponent(importId)}/files`,
      formData,
      {
        onUploadProgress: (event) => {
          if (!event.total || !onProgress) {
            return;
          }

          onProgress(Math.round((event.loaded / event.total) * 100));
        },
      },
    );
  }

  static completeImportSession(importId: string): ApiRequest<StudyImportSessionStatus> {
    return Api.post<StudyImportSessionStatus>(
      `${Studies.endpoint}/import-sessions/${encodeURIComponent(importId)}/complete`,
    );
  }

  static getImportSessionStatus(importId: string): ApiRequest<StudyImportSessionStatus> {
    return Api.get<StudyImportSessionStatus>(
      `${Studies.endpoint}/import-sessions/${encodeURIComponent(importId)}/status`,
    );
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

  static prepareStudy(studyId: string): ApiRequest<StudyPrepareResponse> {
    return Api.post<StudyPrepareResponse>(
      `${Studies.endpoint}/${encodeURIComponent(studyId)}/prepare`,
    );
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
