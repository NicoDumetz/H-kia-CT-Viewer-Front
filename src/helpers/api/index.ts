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

import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";

import { API_BASE_URL, API_TIMEOUT } from "~/constants/app";
import { readStorage } from "~/helpers/Storage";
import type { ApiRequest, ApiRequestConfig } from "~/types/api";

const AUTH_STORAGE_KEY = "auth.session";

interface StoredSession {
  token?: string;
}

class ApiHelper {
  private readonly instance = axios.create({
    baseURL: API_BASE_URL,
    timeout: API_TIMEOUT,
    headers: {
      Accept: "application/json",
    },
  });

  constructor() {
    this.instance.interceptors.request.use((config) => this.handleRequest(config));
  }

  private handleRequest(config: InternalAxiosRequestConfig & ApiRequestConfig) {
    const nextConfig = config;

    if (nextConfig.withAuth !== false) {
      const session = readStorage<StoredSession>(AUTH_STORAGE_KEY);
      const token = session?.token;

      if (token) {
        nextConfig.headers.set("Authorization", `Bearer ${token}`);
      }
    }

    return nextConfig;
  }

  get<T>(url: string, config?: ApiRequestConfig): ApiRequest<T> {
    return this.instance.get<T>(url, config);
  }

  post<T, D = unknown>(url: string, data?: D, config?: ApiRequestConfig): ApiRequest<T> {
    return this.instance.post<T>(url, data, config);
  }

  put<T, D = unknown>(url: string, data?: D, config?: ApiRequestConfig): ApiRequest<T> {
    return this.instance.put<T>(url, data, config);
  }

  patch<T, D = unknown>(url: string, data?: D, config?: ApiRequestConfig): ApiRequest<T> {
    return this.instance.patch<T>(url, data, config);
  }

  delete<T>(url: string, config?: ApiRequestConfig): ApiRequest<T> {
    return this.instance.delete<T>(url, config);
  }

  getClient() {
    return this.instance;
  }
}

const Api = new ApiHelper();

export default Api;
