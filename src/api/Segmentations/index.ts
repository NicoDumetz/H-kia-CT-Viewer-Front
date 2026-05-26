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
import type { Segmentation, SegmentationListResponse } from "~/types/Segmentations";

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
}
