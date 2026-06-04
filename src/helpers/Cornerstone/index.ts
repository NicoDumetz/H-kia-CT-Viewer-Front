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

import { imageLoader, init as initCornerstoneCore } from "@cornerstonejs/core";
import dicomImageLoader from "@cornerstonejs/dicom-image-loader";
import {
  cornerstoneNiftiImageLoader,
  createNiftiImageIdsAndCacheMetadata,
  init as initNiftiLoader,
} from "@cornerstonejs/nifti-volume-loader";
import {
  addTool,
  init as initCornerstoneTools,
  LengthTool,
  PanTool,
  ProbeTool,
  StackScrollTool,
  TrackballRotateTool,
  VolumeRotateTool,
  WindowLevelTool,
  ZoomTool,
} from "@cornerstonejs/tools";
import { gunzipSync } from "fflate";

let isCornerstoneInitialized = false;
let cornerstoneInitializationPromise: Promise<void> | null = null;
const decompressedNiftiUrls = new Map<string, string>();

export const cornerstoneToolGroupId = "hekia-ct-viewer-tool-group";

function getAbsoluteBrowserUrl(url: string) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (typeof window === "undefined") {
    return url;
  }

  return new URL(url, window.location.origin).toString();
}

function isCompressedNiftiUrl(url: string) {
  const cleanUrl = url.split("?")[0] || url;

  return cleanUrl.toLowerCase().endsWith(".nii.gz");
}

async function createDecompressedNiftiUrl(url: string) {
  const cachedUrl = decompressedNiftiUrls.get(url);

  if (cachedUrl) {
    return cachedUrl;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Chargement NIfTI impossible (${response.status}).`);
  }

  const compressedData = new Uint8Array(await response.arrayBuffer());
  const decompressedData = gunzipSync(compressedData);
  const blob = new Blob([decompressedData], { type: "application/octet-stream" });
  const blobUrl = URL.createObjectURL(blob);

  decompressedNiftiUrls.set(url, blobUrl);

  return blobUrl;
}

async function initializeCornerstone() {
  await initCornerstoneCore();
  dicomImageLoader.init({
    maxWebWorkers: Math.max(1, Math.min(navigator.hardwareConcurrency || 1, 4)),
  });
  initNiftiLoader();
  imageLoader.registerImageLoader("nifti", cornerstoneNiftiImageLoader);
  initCornerstoneTools();

  addTool(PanTool);
  addTool(ZoomTool);
  addTool(WindowLevelTool);
  addTool(StackScrollTool);
  addTool(LengthTool);
  addTool(ProbeTool);
  addTool(TrackballRotateTool);
  addTool(VolumeRotateTool);

  isCornerstoneInitialized = true;
}

export async function initCornerstone() {
  if (isCornerstoneInitialized) {
    return;
  }

  if (cornerstoneInitializationPromise) {
    await cornerstoneInitializationPromise;
    return;
  }

  cornerstoneInitializationPromise = initializeCornerstone();

  try {
    await cornerstoneInitializationPromise;
  } catch (error) {
    cornerstoneInitializationPromise = null;
    isCornerstoneInitialized = false;
    throw error;
  }
}

export async function createNiftiImageIds(url: string): Promise<string[]> {
  await initCornerstone();

  const absoluteUrl = getAbsoluteBrowserUrl(url);
  const niftiUrl = isCompressedNiftiUrl(absoluteUrl)
    ? await createDecompressedNiftiUrl(absoluteUrl)
    : absoluteUrl;
  const imageIds = await createNiftiImageIdsAndCacheMetadata({ url: niftiUrl });

  return imageIds as string[];
}

export function releaseDecompressedNiftiUrl(url: string) {
  const absoluteUrl = getAbsoluteBrowserUrl(url);
  const blobUrl = decompressedNiftiUrls.get(absoluteUrl);

  if (!blobUrl) {
    return;
  }

  URL.revokeObjectURL(blobUrl);
  decompressedNiftiUrls.delete(absoluteUrl);
}
