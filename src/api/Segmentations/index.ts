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
import type { ApiRequest } from "~/types/api";
import type {
  Segmentation,
  SegmentationLabelsDocument,
  SegmentationListResponse,
} from "~/types/Segmentations";

export type ManualSegmentationUploadOptions = {
  name?: string;
  labelsJson?: string;
  labelsFile?: File;
};

export class Segmentations {
  static getSegmentations(studyId: string): ApiRequest<SegmentationListResponse> {
    return Api.get<SegmentationListResponse>(
      `/studies/${encodeURIComponent(studyId)}/segmentations`,
    );
  }

  static getSegmentation(studyId: string, segmentationId: string): ApiRequest<Segmentation> {
    return Api.get<Segmentation>(
      `/studies/${encodeURIComponent(studyId)}/segmentations/${encodeURIComponent(segmentationId)}`,
    );
  }

  static getSegmentationLabels(
    studyId: string,
    segmentationId: string,
  ): ApiRequest<SegmentationLabelsDocument> {
    return Api.get<SegmentationLabelsDocument>(
      `/studies/${encodeURIComponent(studyId)}/segmentations/${encodeURIComponent(segmentationId)}/labels`,
    );
  }

  static uploadManualSegmentation(
    studyId: string,
    file: File,
    options: ManualSegmentationUploadOptions = {},
  ): ApiRequest<Segmentation> {
    const formData = new FormData();

    formData.append("file", file);

    if (options.name) {
      formData.append("name", options.name);
    }

    if (options.labelsJson) {
      formData.append("labels_json", options.labelsJson);
    }

    if (options.labelsFile) {
      formData.append("labels", options.labelsFile);
    }

    return Api.post<Segmentation, FormData>(
      `/studies/${encodeURIComponent(studyId)}/segmentations/manual`,
      formData,
    );
  }

  static uploadSegmentation(studyId: string, file: File, name?: string): ApiRequest<Segmentation> {
    return Segmentations.uploadManualSegmentation(studyId, file, { name });
  }
}
