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
// Created     : Thursday June 04 2026
//
// =============================================================

import Api from "~/helpers/api/index";
import type {
  HuCircleMeasurement,
  HuCircleMeasurementCreate,
} from "~/types/Measurements";
import type { ApiRequest } from "~/types/api";

export class Measurements {
  static createHuCircleMeasurement(
    studyId: string,
    payload: HuCircleMeasurementCreate,
  ): ApiRequest<HuCircleMeasurement> {
    return Api.post<HuCircleMeasurement, HuCircleMeasurementCreate>(
      `/studies/${encodeURIComponent(studyId)}/measurements/hu-circle`,
      payload,
    );
  }
}
