// =============================================================
//
// ██╗  ██╗███████╗██╗  ██╗██╗ █████╗
// ██║  ██║██╔════╝██║ ██╔╝██║██╔══██╗
// ███████║█████╗  █████╔╝ ██║███████║
// ██╔══██║██╔══╝  ██╔═██╗ ██║██╔══██║
// ██║  ██║███████╗██║  ██╗██║██║  ██║
// ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
//
// File        : index.tsx
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Thursday June 04 2026
//
// =============================================================

import "@kitware/vtk.js/Rendering/Profiles/Volume";

import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";
import vtkPiecewiseFunction from "@kitware/vtk.js/Common/DataModel/PiecewiseFunction";
import vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import vtkInteractorStyleTrackballCamera from "@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera";
import vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";
import vtkColorTransferFunction from "@kitware/vtk.js/Rendering/Core/ColorTransferFunction";
import vtkVolume from "@kitware/vtk.js/Rendering/Core/Volume";
import vtkVolumeMapper from "@kitware/vtk.js/Rendering/Core/VolumeMapper";
import { BlendMode } from "@kitware/vtk.js/Rendering/Core/VolumeMapper/Constants";
import * as nifti from "nifti-reader-js";
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/Button";
import type { CornerstoneViewerSource } from "../CornerstoneViewer";
import { LoadingState } from "~/components/LoadingState";
import { cn } from "~/helpers/Cn";

type VTKVolume3DViewerProps = {
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>;
  onBackToMpr: () => void;
  className?: string;
};

type VtkRenderPreset = "skin" | "bone" | "debug";
type TypedScalarArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

type LoadedNiftiVolume = {
  dimensions: [number, number, number];
  max: number;
  min: number;
  origin: [number, number, number];
  scalars: TypedScalarArray;
  spacing: [number, number, number];
  stats: ScalarStats;
};

type ScalarStats = {
  dataType: string;
  looksLikeCtHu: boolean;
  max: number;
  min: number;
  p1: number;
  p5: number;
  p50: number;
  p95: number;
  p99: number;
};

type VTKScene = {
  genericRenderWindow: ReturnType<typeof vtkGenericRenderWindow.newInstance>;
  mapper: ReturnType<typeof vtkVolumeMapper.newInstance>;
  renderer: ReturnType<ReturnType<typeof vtkGenericRenderWindow.newInstance>["getRenderer"]>;
  renderWindow: ReturnType<
    ReturnType<typeof vtkGenericRenderWindow.newInstance>["getRenderWindow"]
  >;
  sourceVolume: LoadedNiftiVolume;
  volume: ReturnType<typeof vtkVolume.newInstance>;
};

const renderPresetDescriptions: Record<VtkRenderPreset, string> = {
  bone: "Os : masque les tissus mous et met en avant les structures osseuses.",
  debug: "Debug : rendu brut expérimental, non cubique.",
  skin: "Peau : rendu coloré des tissus et des os, avec l'air rendu transparent.",
};

const datatypeByteSizes: Record<number, number> = {
  2: 1,
  4: 2,
  8: 4,
  16: 4,
  64: 8,
  256: 1,
  512: 2,
  768: 4,
};
const niftiVolumeCache = new Map<string, Promise<LoadedNiftiVolume>>();

function isBrowserLittleEndian() {
  const testBuffer = new ArrayBuffer(2);

  new DataView(testBuffer).setUint16(0, 256, true);

  return new Uint16Array(testBuffer)[0] === 256;
}

function getNiftiTypedArray(
  imageBuffer: ArrayBuffer,
  datatypeCode: number,
  voxelCount: number,
): TypedScalarArray | null {
  switch (datatypeCode) {
    case 2:
      return new Uint8Array(imageBuffer, 0, voxelCount);
    case 4:
      return new Int16Array(imageBuffer, 0, voxelCount);
    case 8:
      return new Int32Array(imageBuffer, 0, voxelCount);
    case 16:
      return new Float32Array(imageBuffer, 0, voxelCount);
    case 64:
      return new Float64Array(imageBuffer, 0, voxelCount);
    case 256:
      return new Int8Array(imageBuffer, 0, voxelCount);
    case 512:
      return new Uint16Array(imageBuffer, 0, voxelCount);
    case 768:
      return new Uint32Array(imageBuffer, 0, voxelCount);
    default:
      return null;
  }
}

function waitForFinalPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function getNiftiScalarValue(
  dataView: DataView,
  index: number,
  datatypeCode: number,
  littleEndian: boolean,
) {
  switch (datatypeCode) {
    case 2:
      return dataView.getUint8(index);
    case 4:
      return dataView.getInt16(index * 2, littleEndian);
    case 8:
      return dataView.getInt32(index * 4, littleEndian);
    case 16:
      return dataView.getFloat32(index * 4, littleEndian);
    case 64:
      return dataView.getFloat64(index * 8, littleEndian);
    case 256:
      return dataView.getInt8(index);
    case 512:
      return dataView.getUint16(index * 2, littleEndian);
    case 768:
      return dataView.getUint32(index * 4, littleEndian);
    default:
      throw new Error(`Type NIfTI non supporté pour la 3D VTK (${datatypeCode}).`);
  }
}

function getPercentile(sortedValues: number[], percentile: number) {
  if (!sortedValues.length) {
    return 0;
  }

  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.round((sortedValues.length - 1) * percentile)),
  );

  return sortedValues[index];
}

function computeScalarStats(scalars: TypedScalarArray, dataType: string): ScalarStats {
  const maxSamples = 40000;
  const sampleStep = Math.max(1, Math.floor(scalars.length / maxSamples));
  const sampledValues: number[] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < scalars.length; index += sampleStep) {
    const value = scalars[index];

    min = Math.min(min, value);
    max = Math.max(max, value);
    sampledValues.push(value);
  }

  const lastValue = scalars[scalars.length - 1];

  min = Math.min(min, lastValue);
  max = Math.max(max, lastValue);
  sampledValues.push(lastValue);
  sampledValues.sort((left, right) => left - right);

  const p1 = getPercentile(sampledValues, 0.01);
  const p5 = getPercentile(sampledValues, 0.05);
  const p50 = getPercentile(sampledValues, 0.5);
  const p95 = getPercentile(sampledValues, 0.95);
  const p99 = getPercentile(sampledValues, 0.99);

  return {
    dataType,
    looksLikeCtHu: min < -500 && max > 500,
    max,
    min,
    p1,
    p5,
    p50,
    p95,
    p99,
  };
}

function createScaledFloatScalars(
  imageBuffer: ArrayBuffer,
  datatypeCode: number,
  littleEndian: boolean,
  voxelCount: number,
  slope: number,
  intercept: number,
) {
  const dataView = new DataView(imageBuffer);
  const scalars = new Float32Array(voxelCount);

  for (let index = 0; index < voxelCount; index += 1) {
    const value = getNiftiScalarValue(dataView, index, datatypeCode, littleEndian) * slope + intercept;

    scalars[index] = value;
  }
  const stats = computeScalarStats(scalars, scalars.constructor.name);

  return {
    max: stats.max,
    min: stats.min,
    scalars,
    stats,
  };
}

function parseNiftiVolume(arrayBuffer: ArrayBuffer, url: string): LoadedNiftiVolume {
  debugVtk3D("nifti parse start", {
    compressedBytes: arrayBuffer.byteLength,
    url,
  });
  const decompressedBuffer = nifti.isCompressed(arrayBuffer)
    ? (nifti.decompress(arrayBuffer) as ArrayBuffer)
    : arrayBuffer;

  debugVtk3D("nifti decompressed", {
    bytes: decompressedBuffer.byteLength,
    url,
  });

  if (!nifti.isNIFTI(decompressedBuffer)) {
    throw new Error("Le fichier préparé n'est pas un volume NIfTI lisible par VTK.");
  }

  const header = nifti.readHeader(decompressedBuffer);

  if (!header) {
    throw new Error("Lecture de l'entête NIfTI impossible.");
  }

  const dimensions: [number, number, number] = [
    header.dims[1] || 0,
    header.dims[2] || 0,
    header.dims[3] || 0,
  ];

  if (dimensions.some((dimension) => dimension <= 0)) {
    throw new Error("Dimensions NIfTI invalides pour le rendu 3D.");
  }

  const byteSize = datatypeByteSizes[header.datatypeCode];

  if (!byteSize) {
    throw new Error(`Type NIfTI non supporté pour la 3D VTK (${header.datatypeCode}).`);
  }

  const imageBuffer = nifti.readImage(header, decompressedBuffer);
  const voxelCount = dimensions[0] * dimensions[1] * dimensions[2];

  if (imageBuffer.byteLength < voxelCount * byteSize) {
    throw new Error("Données NIfTI incomplètes pour le rendu 3D.");
  }

  const slope = header.scl_slope && header.scl_slope !== 0 ? header.scl_slope : 1;
  const intercept = header.scl_inter || 0;
  const canUseNativeTypedArray =
    slope === 1 &&
    intercept === 0 &&
    header.littleEndian === isBrowserLittleEndian();
  const nativeScalars = canUseNativeTypedArray
    ? getNiftiTypedArray(imageBuffer, header.datatypeCode, voxelCount)
    : null;
  const nativeStats = nativeScalars
    ? computeScalarStats(nativeScalars, nativeScalars.constructor.name)
    : null;
  const scalarPayload = nativeScalars && nativeStats
    ? {
        max: nativeStats.max,
        min: nativeStats.min,
        scalars: nativeScalars,
        stats: nativeStats,
      }
    : createScaledFloatScalars(
        imageBuffer,
        header.datatypeCode,
        header.littleEndian,
        voxelCount,
        slope,
        intercept,
      );

  debugVtk3D("nifti scalars ready", {
    datatypeCode: header.datatypeCode,
    max: scalarPayload.max,
    min: scalarPayload.min,
    nativeTypedArray: Boolean(nativeScalars),
    percentiles: {
      p1: scalarPayload.stats.p1,
      p5: scalarPayload.stats.p5,
      p50: scalarPayload.stats.p50,
      p95: scalarPayload.stats.p95,
      p99: scalarPayload.stats.p99,
    },
    rangeLooksLikeCtHu: scalarPayload.stats.looksLikeCtHu,
    scalarType: scalarPayload.scalars.constructor.name,
    voxelCount,
  });

  if (!scalarPayload.stats.looksLikeCtHu) {
    debugVtk3D("Volume range does not look like CT HU. Presets may be inaccurate.", {
      max: scalarPayload.stats.max,
      min: scalarPayload.stats.min,
      p1: scalarPayload.stats.p1,
      p50: scalarPayload.stats.p50,
      p99: scalarPayload.stats.p99,
    });
  }

  return {
    dimensions,
    max: scalarPayload.max,
    min: scalarPayload.min,
    origin: [
      Number.isFinite(header.qoffset_x) ? header.qoffset_x : 0,
      Number.isFinite(header.qoffset_y) ? header.qoffset_y : 0,
      Number.isFinite(header.qoffset_z) ? header.qoffset_z : 0,
    ],
    scalars: scalarPayload.scalars,
    spacing: [
      Math.abs(header.pixDims[1] || 1),
      Math.abs(header.pixDims[2] || 1),
      Math.abs(header.pixDims[3] || 1),
    ],
    stats: scalarPayload.stats,
  };
}

async function fetchNiftiVolume(url: string) {
  const cachedVolumePromise = niftiVolumeCache.get(url);

  if (cachedVolumePromise) {
    debugVtk3D("nifti cache hit", { url });
    return cachedVolumePromise;
  }

  const volumePromise = fetch(url)
    .then(async (response) => {
      debugVtk3D("nifti fetch response", {
        contentLength: response.headers.get("content-length"),
        contentType: response.headers.get("content-type"),
        status: response.status,
        url,
      });

      if (!response.ok) {
        throw new Error(`Chargement du volume 3D impossible (${response.status}).`);
      }

      const arrayBuffer = await response.arrayBuffer();

      debugVtk3D("nifti fetch complete", {
        bytes: arrayBuffer.byteLength,
        url,
      });

      return parseNiftiVolume(arrayBuffer, url);
    })
    .catch((error: unknown) => {
      niftiVolumeCache.delete(url);
      throw error;
    });

  niftiVolumeCache.set(url, volumePromise);

  return volumePromise;
}

function createVtkImageData(volume: LoadedNiftiVolume) {
  const imageData = vtkImageData.newInstance();
  const scalarArray = vtkDataArray.newInstance({
    name: "CT Hounsfield Units",
    numberOfComponents: 1,
    values: volume.scalars,
  });

  imageData.setDimensions(volume.dimensions);
  imageData.setSpacing(volume.spacing);
  imageData.setOrigin(volume.origin);
  imageData.getPointData().setScalars(scalarArray);

  return imageData;
}

function getPresetScalarValue(_volume: LoadedNiftiVolume, huValue: number, _fallbackRatio: number) {
  return huValue;
}

function addColorPoint(
  colorTransfer: ReturnType<typeof vtkColorTransferFunction.newInstance>,
  volume: LoadedNiftiVolume,
  huValue: number,
  fallbackRatio: number,
  red: number,
  green: number,
  blue: number,
) {
  colorTransfer.addRGBPoint(
    getPresetScalarValue(volume, huValue, fallbackRatio),
    red,
    green,
    blue,
  );
}

function addOpacityPoint(
  opacityTransfer: ReturnType<typeof vtkPiecewiseFunction.newInstance>,
  volume: LoadedNiftiVolume,
  huValue: number,
  fallbackRatio: number,
  opacity: number,
) {
  opacityTransfer.addPoint(getPresetScalarValue(volume, huValue, fallbackRatio), opacity);
}

function applyLighting(
  scene: VTKScene,
  {
    ambient,
    diffuse,
    shade,
    specular,
    specularPower,
  }: {
    ambient: number;
    diffuse: number;
    shade: boolean;
    specular: number;
    specularPower: number;
  },
) {
  const property = scene.volume.getProperty();

  property.setShade(shade);
  property.setAmbient(ambient);
  property.setDiffuse(diffuse);
  property.setSpecular(specular);
  property.setSpecularPower(specularPower);
  property.setUseGradientOpacity(0, shade);
  property.setGradientOpacityMinimumValue(0, 20);
  property.setGradientOpacityMinimumOpacity(0, 0);
  property.setGradientOpacityMaximumValue(0, 450);
  property.setGradientOpacityMaximumOpacity(0, shade ? 0.85 : 0);
}

function applyVtkRenderPreset(scene: VTKScene, preset: VtkRenderPreset) {
  const volume = scene.sourceVolume;
  const colorTransfer = vtkColorTransferFunction.newInstance();
  const opacityTransfer = vtkPiecewiseFunction.newInstance();
  const spacing = scene.mapper.getInputData()?.getSpacing?.() || [1, 1, 1];
  const unitDistance = Math.max(0.1, (spacing[0] + spacing[1] + spacing[2]) / 3);
  const property = scene.volume.getProperty();

  if (preset === "debug") {
    scene.mapper.setBlendMode(BlendMode.COMPOSITE_BLEND);
    scene.mapper.setSampleDistance(Math.max(1.6, Math.min(...volume.spacing) * 3));
    addColorPoint(colorTransfer, volume, -1000, 0, 0, 0, 0);
    addColorPoint(colorTransfer, volume, -400, 0.1, 0, 0, 0);
    addColorPoint(colorTransfer, volume, 150, 0.55, 0.7, 0.54, 0.48);
    addColorPoint(colorTransfer, volume, 800, 0.9, 1, 1, 1);
    addOpacityPoint(opacityTransfer, volume, -1000, 0, 0);
    addOpacityPoint(opacityTransfer, volume, -400, 0.1, 0);
    addOpacityPoint(opacityTransfer, volume, 150, 0.55, 0.08);
    addOpacityPoint(opacityTransfer, volume, 800, 0.9, 0.45);
    property.setInterpolationTypeToNearest();
    applyLighting(scene, {
      ambient: 0.55,
      diffuse: 0.45,
      shade: false,
      specular: 0,
      specularPower: 1,
    });
  } else if (preset === "skin") {
    scene.mapper.setBlendMode(BlendMode.COMPOSITE_BLEND);
    scene.mapper.setSampleDistance(Math.max(0.48, Math.min(...volume.spacing) * 0.9));
    addColorPoint(colorTransfer, volume, -1000, 0, 0, 0, 0);
    addColorPoint(colorTransfer, volume, -500, 0.12, 0, 0, 0);
    addColorPoint(colorTransfer, volume, -250, 0.28, 0.08, 0.42, 0.34);
    addColorPoint(colorTransfer, volume, -150, 0.36, 0.22, 0.18, 0.12);
    addColorPoint(colorTransfer, volume, -50, 0.44, 0.5, 0.2, 0.09);
    addColorPoint(colorTransfer, volume, 40, 0.52, 0.58, 0.29, 0.16);
    addColorPoint(colorTransfer, volume, 100, 0.6, 0.72, 0.46, 0.32);
    addColorPoint(colorTransfer, volume, 250, 0.7, 0.9, 0.82, 0.68);
    addColorPoint(colorTransfer, volume, 500, 0.82, 1, 0.98, 0.9);
    addColorPoint(colorTransfer, volume, 1000, 1, 1, 1, 0.98);
    addOpacityPoint(opacityTransfer, volume, -1000, 0, 0);
    addOpacityPoint(opacityTransfer, volume, -500, 0.12, 0);
    addOpacityPoint(opacityTransfer, volume, -400, 0.18, 0);
    addOpacityPoint(opacityTransfer, volume, -250, 0.28, 0.012);
    addOpacityPoint(opacityTransfer, volume, -150, 0.36, 0.04);
    addOpacityPoint(opacityTransfer, volume, -50, 0.44, 0.1);
    addOpacityPoint(opacityTransfer, volume, 40, 0.52, 0.18);
    addOpacityPoint(opacityTransfer, volume, 100, 0.6, 0.27);
    addOpacityPoint(opacityTransfer, volume, 250, 0.7, 0.36);
    addOpacityPoint(opacityTransfer, volume, 500, 0.82, 0.62);
    addOpacityPoint(opacityTransfer, volume, 1000, 1, 0.9);
    applyLighting(scene, {
      ambient: 0.26,
      diffuse: 0.75,
      shade: true,
      specular: 0.2,
      specularPower: 10,
    });
  } else {
    scene.mapper.setBlendMode(BlendMode.COMPOSITE_BLEND);
    scene.mapper.setSampleDistance(Math.max(0.42, Math.min(...volume.spacing) * 0.75));
    addColorPoint(colorTransfer, volume, -1000, 0, 0, 0, 0);
    addColorPoint(colorTransfer, volume, 150, 0.42, 0.8, 0.78, 0.72);
    addColorPoint(colorTransfer, volume, 300, 0.58, 0.94, 0.92, 0.85);
    addColorPoint(colorTransfer, volume, 500, 0.72, 1, 0.98, 0.9);
    addColorPoint(colorTransfer, volume, 1200, 0.9, 1, 1, 0.98);
    addColorPoint(colorTransfer, volume, 2500, 1, 1, 1, 1);
    addOpacityPoint(opacityTransfer, volume, -1000, 0, 0);
    addOpacityPoint(opacityTransfer, volume, 149, 0.4, 0);
    addOpacityPoint(opacityTransfer, volume, 200, 0.5, 0.02);
    addOpacityPoint(opacityTransfer, volume, 300, 0.62, 0.18);
    addOpacityPoint(opacityTransfer, volume, 500, 0.74, 0.72);
    addOpacityPoint(opacityTransfer, volume, 1200, 0.92, 1);
    addOpacityPoint(opacityTransfer, volume, 2500, 1, 1);
    applyLighting(scene, {
      ambient: 0.24,
      diffuse: 0.76,
      shade: true,
      specular: 0.24,
      specularPower: 14,
    });
  }

  property.setRGBTransferFunction(0, colorTransfer);
  property.setScalarOpacity(0, opacityTransfer);
  property.setScalarOpacityUnitDistance(0, unitDistance);
  if (preset !== "debug") {
    property.setInterpolationTypeToFastLinear();
  }

  scene.renderWindow.render();
}

function getCanvasPixelState(container: HTMLDivElement) {
  const canvas = container.querySelector("canvas");

  if (!canvas) {
    return null;
  }

  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;

  try {
    gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  } catch {
    return null;
  }

  if (!gl || !gl.drawingBufferWidth || !gl.drawingBufferHeight) {
    return null;
  }

  const sampleWidth = Math.min(64, gl.drawingBufferWidth);
  const sampleHeight = Math.min(64, gl.drawingBufferHeight);
  const x = Math.max(0, Math.round(gl.drawingBufferWidth / 2 - sampleWidth / 2));
  const y = Math.max(0, Math.round(gl.drawingBufferHeight / 2 - sampleHeight / 2));
  const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);

  try {
    gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  } catch {
    return null;
  }

  for (let index = 0; index < pixels.length; index += 4) {
    const brightness = (pixels[index] || 0) + (pixels[index + 1] || 0) + (pixels[index + 2] || 0);
    const alpha = pixels[index + 3] || 0;

    if (alpha > 0 && brightness > 12) {
      return true;
    }
  }

  return false;
}

function debugVtk3D(message: string, payload?: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }

  if (payload) {
    console.debug(`[VTK 3D Viewer] ${message}`, payload);
    return;
  }

  console.debug(`[VTK 3D Viewer] ${message}`);
}

export function VTKVolume3DViewer({ className, onBackToMpr, source }: VTKVolume3DViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<VTKScene | null>(null);
  const activeRenderModeRef = useRef<VtkRenderPreset>("skin");
  const [activeRenderMode, setActiveRenderMode] = useState<VtkRenderPreset>("skin");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [volumeInfo, setVolumeInfo] = useState<LoadedNiftiVolume | null>(null);

  const resetCamera = () => {
    const scene = sceneRef.current;

    if (!scene) {
      return;
    }

    scene.renderer.resetCamera();
    scene.renderer.resetCameraClippingRange();
    scene.renderWindow.render();
  };

  const handleRenderModeChange = (mode: VtkRenderPreset) => {
    const scene = sceneRef.current;

    activeRenderModeRef.current = mode;
    setActiveRenderMode(mode);

    if (!scene) {
      return;
    }

    applyVtkRenderPreset(scene, mode);
  };

  useEffect(() => {
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const viewportElement = containerRef.current;

    if (!viewportElement) {
      setError("Viewport VTK indisponible.");
      setIsLoading(false);
      return;
    }

    const element = viewportElement;

    async function setup() {
      setError(null);
      setIsLoading(true);
      setVolumeInfo(null);

      try {
        const rect = element.getBoundingClientRect();

        if (rect.width <= 0 || rect.height <= 0) {
          throw new Error("Le viewport VTK n'a pas de taille exploitable.");
        }

        debugVtk3D("container size", {
          height: rect.height,
          width: rect.width,
        });

        const loadedVolume = await fetchNiftiVolume(source.url);

        if (isCancelled) {
          return;
        }

        debugVtk3D("nifti loaded", {
          dimensions: loadedVolume.dimensions,
          max: loadedVolume.max,
          min: loadedVolume.min,
          percentiles: {
            p1: loadedVolume.stats.p1,
            p5: loadedVolume.stats.p5,
            p50: loadedVolume.stats.p50,
            p95: loadedVolume.stats.p95,
            p99: loadedVolume.stats.p99,
          },
          rangeLooksLikeCtHu: loadedVolume.stats.looksLikeCtHu,
          spacing: loadedVolume.spacing,
        });

        const imageData = createVtkImageData(loadedVolume);
        const genericRenderWindow = vtkGenericRenderWindow.newInstance({
          background: [0, 0, 0],
          listenWindowResize: false,
        });

        genericRenderWindow.setContainer(element);
        genericRenderWindow.resize();

        const renderer = genericRenderWindow.getRenderer();
        const renderWindow = genericRenderWindow.getRenderWindow();
        const interactor = genericRenderWindow.getInteractor();
        const style = vtkInteractorStyleTrackballCamera.newInstance();
        const mapper = vtkVolumeMapper.newInstance();
        const volume = vtkVolume.newInstance();

        interactor.setInteractorStyle(style);
        interactor.setDesiredUpdateRate(15);
        interactor.setPreventDefaultOnPointerDown(true);
        interactor.setPreventDefaultOnPointerUp(true);
        mapper.setInputData(imageData);
        mapper.setSampleDistance(Math.max(0.35, Math.min(...loadedVolume.spacing) * 0.7));
        volume.setMapper(mapper);

        const scene: VTKScene = {
          genericRenderWindow,
          mapper,
          renderer,
          renderWindow,
          sourceVolume: loadedVolume,
          volume,
        };

        sceneRef.current = scene;
        renderer.addVolume(volume);
        applyVtkRenderPreset(scene, activeRenderModeRef.current);
        renderer.resetCamera();
        renderer.resetCameraClippingRange();
        renderWindow.render();
        const immediatePixelState = getCanvasPixelState(element);
        await waitForFinalPaint();

        if (isCancelled) {
          return;
        }

        const paintedPixelState = getCanvasPixelState(element);
        const pixelState = immediatePixelState === true ? true : paintedPixelState;

        debugVtk3D("render diagnostics", {
          canvasCount: element.querySelectorAll("canvas").length,
          immediatePixelState,
          hasNonBlackPixel: pixelState,
          paintedPixelState,
          renderMode: activeRenderModeRef.current,
        });

        if (pixelState === false) {
          throw new Error(
            "Le volume VTK est chargé mais le rendu est noir. Preset/transfer function à corriger.",
          );
        }

        resizeObserver = new ResizeObserver(() => {
          genericRenderWindow.resize();
          renderWindow.render();
        });
        resizeObserver.observe(element);

        setVolumeInfo(loadedVolume);
      } catch (setupError) {
        sceneRef.current?.genericRenderWindow.delete();
        sceneRef.current = null;

        if (!isCancelled) {
          setError(
            setupError instanceof Error
              ? setupError.message || "Rendu 3D VTK indisponible."
              : "Rendu 3D VTK indisponible.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void setup();

    return () => {
      isCancelled = true;
      resizeObserver?.disconnect();
      sceneRef.current?.genericRenderWindow.delete();
      sceneRef.current = null;
      element.innerHTML = "";
    };
  }, [source.url]);

  return (
    <div className={cn("flex h-full w-full flex-col bg-viewer", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft bg-surface-100 p-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text">Rendu 3D VTK</p>
          <p className="text-xs text-text-muted">
            {volumeInfo
              ? `${volumeInfo.dimensions.join(" x ")} voxels`
              : "Volume rendering indépendant de Cornerstone"}
          </p>
          <p className="mt-1 text-xs text-text-soft">
            {renderPresetDescriptions[activeRenderMode]}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button className="h-8" onClick={onBackToMpr} size="sm" variant="outline">
            Retour MPR
          </Button>
          <Button className="h-8" onClick={resetCamera} size="sm" variant="ghost">
            Reset 3D
          </Button>
          {([
            "skin",
            "bone",
            ...(import.meta.env.DEV ? (["debug"] as const) : []),
          ] as VtkRenderPreset[]).map((mode) => (
            <Button
              className="h-8"
              key={mode}
              onClick={() => handleRenderModeChange(mode)}
              size="sm"
              variant={activeRenderMode === mode ? "primary" : "ghost"}
            >
              {mode === "skin" ? "Peau" : mode === "debug" ? "Debug" : "Os"}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 w-full flex-1 bg-black">
        <div className="h-full w-full pointer-events-auto" ref={containerRef} />

        {!error && isLoading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-viewer">
            <div className="rounded-xl border border-border-soft bg-surface p-6 shadow-xl">
              <LoadingState label="Chargement rendu 3D VTK..." />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-viewer">
            <div className="max-w-md rounded-lg border border-quaternary-700 bg-surface p-5 text-center">
              <p className="text-sm font-semibold text-quaternary-100">{error}</p>
              <p className="mt-3 text-xs leading-relaxed text-text-muted">
                La 3D utilise VTK.js et lit le volume NIfTI préparé côté navigateur.
              </p>
              <Button className="mt-4" onClick={onBackToMpr} size="sm" variant="outline">
                Retour MPR
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
