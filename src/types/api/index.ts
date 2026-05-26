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

import type { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

export type ApiRequest<T> = Promise<AxiosResponse<T>>;

export interface ApiErrorResponse {
  message?: string;
  statusCode?: number;
  error?: string;
  [key: string]: unknown;
}

export type ApiError = AxiosError<ApiErrorResponse>;

export interface ApiRequestConfig extends AxiosRequestConfig {
  withAuth?: boolean;
}
