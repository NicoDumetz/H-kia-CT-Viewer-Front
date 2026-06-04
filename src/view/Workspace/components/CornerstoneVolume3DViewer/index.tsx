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

import {
  addVolumesToViewports,
  Enums,
  RenderingEngine,
  volumeLoader,
} from "@cornerstonejs/core";
import type { Types } from "@cornerstonejs/core";
import {
  Enums as ToolEnums,
  PanTool,
  TrackballRotateTool,
  ToolGroupManager,
  ZoomTool,
} from "@cornerstonejs/tools";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { WheelEvent } from "react";

import { Button } from "~/components/Button";
import type {
  CornerstoneViewerSource,
  ViewerActionRequest,
} from "../CornerstoneViewer";
import { LoadingState } from "~/components/LoadingState";
import { cornerstoneToolGroupId, createNiftiImageIds, initCornerstone } from "~/helpers/Cornerstone";
import { cn } from "~/helpers/Cn";

type CornerstoneVolume3DViewerProps = {
  source: Extract<CornerstoneViewerSource, { type: "nifti" }>;
  onBackToMpr: () => void;
  actionRequest?: ViewerActionRequest | null;
  onRenderError?: () => void;
  className?: string;
};

type Volume3DInteractionTool = "rotate" | "pan" | "zoom";

type CornerstoneToolGroup = NonNullable<ReturnType<typeof ToolGroupManager.getToolGroup>>;

type ResettableViewport = Types.IViewport & {
  getActors?: () => Array<{
    actor?: {
      getMapper?: () => {
        getBlendMode?: () => number;
        getInputData?: () => {
          getDimensions?: () => number[];
          getSpacing?: () => number[];
        } | null;
        setBlendMode?: (blendMode: number) => void;
      } | null;
    };
  }>;
  getCamera?: () => {
    focalPoint?: Types.Point3;
    parallelScale?: number;
    position?: Types.Point3;
    viewPlaneNormal?: Types.Point3;
    viewUp?: Types.Point3;
  };
  getDefaultActor?: () => unknown;
  getProperties?: (volumeId?: string) => unknown;
  getZoom?: () => number;
  resetCamera?: (options?: {
    resetPan?: boolean;
    resetToCenter?: boolean;
    resetZoom?: boolean;
  }) => void;
  render?: () => void;
  setCamera?: (camera: {
    parallelScale?: number;
  }) => void;
  setZoom?: (zoom: number) => void;
  setProperties?: (
    properties: {
      preset?: string;
      sampleDistanceMultiplier?: number;
      voiRange?: {
        lower: number;
        upper: number;
      };
    },
    volumeId?: string,
  ) => void;
};

type VolumeMapperLike = {
  getBlendMode?: () => number;
  getInputData?: () => {
    getDimensions?: () => number[];
    getSpacing?: () => number[];
  } | null;
  setBlendMode?: (blendMode: number) => void;
};

type WindowPresetId = "soft" | "bone" | "lung";
type Volume3DRenderMode = "mip" | "bone" | "soft" | "voxel-debug";

type WindowPreset = {
  id: WindowPresetId;
  label: string;
  width: number;
  level: number;
};

const windowPresets: WindowPreset[] = [
  { id: "soft", label: "Soft", width: 400, level: 40 },
  { id: "bone", label: "Bone", width: 2000, level: 500 },
  { id: "lung", label: "Lung", width: 1500, level: -600 },
];

const interactionTools: Array<{ id: Volume3DInteractionTool; label: string }> = [
  { id: "rotate", label: "Rotate" },
  { id: "pan", label: "Pan" },
  { id: "zoom", label: "Zoom" },
];

const renderModes: Array<{ id: Volume3DRenderMode; label: string }> = [
  { id: "mip", label: "MIP" },
  { id: "bone", label: "Bone" },
  { id: "soft", label: "Soft" },
  { id: "voxel-debug", label: "Voxel debug" },
];

function debug3D(message: string, payload?: Record<string, unknown>) {
  if (!import.meta.env.DEV) {
    return;
  }

  if (payload) {
    console.debug(`[3D Viewer] ${message}`, payload);
    return;
  }

  console.debug(`[3D Viewer] ${message}`);
}

function getSourceKey(source: Extract<CornerstoneViewerSource, { type: "nifti" }>) {
  return `nifti-3d-${source.url}`.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120);
}

function waitForFinalPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function getVoiRange(preset: WindowPreset) {
  const halfWidth = preset.width / 2;

  return {
    lower: preset.level - halfWidth,
    upper: preset.level + halfWidth,
  };
}

function getPreset(presetId: WindowPresetId) {
  return windowPresets.find((preset) => preset.id === presetId) || windowPresets[0];
}

function getVolume3DRenderModeConfig(mode: Volume3DRenderMode) {
  if (mode === "soft") {
    return {
      blendMode: Enums.BlendModes.COMPOSITE,
      presetId: "soft" as const,
      presetName: "CT-Soft-Tissue",
      sampleDistanceMultiplier: 0.8,
    };
  }

  if (mode === "mip") {
    return {
      blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
      presetId: "bone" as const,
      presetName: "CT-MIP",
      sampleDistanceMultiplier: 0.7,
    };
  }

  return {
    blendMode: Enums.BlendModes.COMPOSITE,
    presetId: "bone" as const,
    presetName: "CT-Bone",
    sampleDistanceMultiplier: 0.65,
  };
}

function setViewportBlendMode(viewport: ResettableViewport, blendMode: number) {
  const actors = viewport.getActors?.() || [];
  let updatedActors = 0;

  actors.forEach((actorEntry) => {
    const mapper = actorEntry.actor?.getMapper?.() as VolumeMapperLike | null | undefined;

    if (mapper?.setBlendMode) {
      mapper.setBlendMode(blendMode);
      updatedActors += 1;
    }
  });

  return updatedActors;
}

function applyVolume3DRenderModeToViewport(
  viewport: ResettableViewport,
  mode: Exclude<Volume3DRenderMode, "voxel-debug">,
  volumeId: string,
) {
  const config = getVolume3DRenderModeConfig(mode);
  const preset = getPreset(config.presetId);
  const updatedActors = setViewportBlendMode(viewport, config.blendMode);

  viewport.setProperties?.(
    {
      preset: config.presetName,
      sampleDistanceMultiplier: config.sampleDistanceMultiplier,
      voiRange: getVoiRange(preset),
    },
    volumeId,
  );
  viewport.render?.();

  return {
    ...config,
    updatedActors,
  };
}

function getCanvasPixelState(canvas: HTMLCanvasElement) {
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;

  try {
    gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  } catch (canvasError) {
    debug3D("canvas context inspection failed", {
      message: canvasError instanceof Error ? canvasError.message : String(canvasError),
    });
    return null;
  }

  if (!gl) {
    return null;
  }

  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;

  if (!width || !height) {
    return {
      hasNonBlackPixel: false,
      sampledPixels: 0,
    };
  }

  const sampleSize = 64;
  const centers = [
    [0.5, 0.5],
    [0.35, 0.35],
    [0.65, 0.35],
    [0.35, 0.65],
    [0.65, 0.65],
  ];
  let sampledPixels = 0;

  for (const [ratioX, ratioY] of centers) {
    const sampleWidth = Math.min(sampleSize, width);
    const sampleHeight = Math.min(sampleSize, height);
    const x = Math.max(0, Math.min(width - sampleWidth, Math.round(width * ratioX - sampleWidth / 2)));
    const y = Math.max(0, Math.min(height - sampleHeight, Math.round(height * ratioY - sampleHeight / 2)));
    const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);

    try {
      gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } catch (pixelError) {
      debug3D("canvas pixel inspection failed", {
        message: pixelError instanceof Error ? pixelError.message : String(pixelError),
      });
      return null;
    }
    sampledPixels += sampleWidth * sampleHeight;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] || 0;
      const brightness = (pixels[index] || 0) + (pixels[index + 1] || 0) + (pixels[index + 2] || 0);

      if (alpha > 0 && brightness > 12) {
        return {
          hasNonBlackPixel: true,
          sampledPixels,
        };
      }
    }
  }

  return {
    hasNonBlackPixel: false,
    sampledPixels,
  };
}

function inspectVolume3DRender(element: HTMLDivElement, viewport: ResettableViewport, volumeId: string) {
  const canvases = Array.from(element.querySelectorAll("canvas"));
  const canvas = canvases[0] || null;
  const actors = viewport.getActors?.() || [];
  const firstMapper = actors[0]?.actor?.getMapper?.() as VolumeMapperLike | null | undefined;
  const imageData = firstMapper?.getInputData?.();
  const pixelState = canvas ? getCanvasPixelState(canvas) : null;

  return {
    actorCount: actors.length,
    blendMode: firstMapper?.getBlendMode?.(),
    camera: viewport.getCamera?.(),
    canvasCount: canvases.length,
    canvasSize: canvas
      ? {
          height: canvas.height,
          styleHeight: canvas.style.height,
          styleWidth: canvas.style.width,
          width: canvas.width,
        }
      : null,
    hasDefaultActor: Boolean(viewport.getDefaultActor?.()),
    hasNonBlackPixel: pixelState?.hasNonBlackPixel ?? null,
    imageData: imageData
      ? {
          dimensions: imageData.getDimensions?.(),
          spacing: imageData.getSpacing?.(),
        }
      : null,
    properties: viewport.getProperties?.(volumeId),
    sampledPixels: pixelState?.sampledPixels ?? 0,
    viewportClass: viewport.constructor.name,
  };
}

function setVolume3DPrimaryTool(toolGroup: CornerstoneToolGroup, tool: Volume3DInteractionTool) {
  [TrackballRotateTool.toolName, PanTool.toolName, ZoomTool.toolName].forEach((toolName) => {
    try {
      toolGroup.setToolPassive(toolName, { removeAllBindings: true });
    } catch {
      // Tool may already be tearing down.
    }
  });

  const toolName =
    tool === "pan"
      ? PanTool.toolName
      : tool === "zoom"
        ? ZoomTool.toolName
        : TrackballRotateTool.toolName;

  toolGroup.setToolActive(toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
  });
}

function waitForElementSize(element: HTMLDivElement) {
  return new Promise<DOMRect>((resolve, reject) => {
    let frameCount = 0;

    function checkSize() {
      const rect = element.getBoundingClientRect();

      if (import.meta.env.DEV && frameCount === 0) {
        debug3D("element size", {
          height: rect.height,
          width: rect.width,
        });
      }

      if (rect.width > 0 && rect.height > 0) {
        resolve(rect);
        return;
      }

      frameCount += 1;

      if (frameCount > 120) {
        reject(new Error("Le viewport 3D n'a pas de taille exploitable."));
        return;
      }

      requestAnimationFrame(checkSize);
    }

    checkSize();
  });
}

export function CornerstoneVolume3DViewer({
  actionRequest,
  className,
  onBackToMpr,
  onRenderError,
  source,
}: CornerstoneVolume3DViewerProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const reactId = useId().replace(/:/g, "");
  const sourceKey = useMemo(() => getSourceKey(source), [source]);
  const renderingEngineId = `hekia-volume-3d-rendering-engine-${reactId}-${sourceKey}`;
  const viewportId = `hekia-volume-3d-viewport-${reactId}-${sourceKey}`;
  const toolGroupId = `${cornerstoneToolGroupId}-volume-3d-${reactId}-${sourceKey}`;
  const volumeId = `cornerstoneStreamingImageVolume:hekia-volume-3d-${reactId}-${sourceKey}`;
  const [error, setError] = useState<string | null>(null);
  const [activeInteractionTool, setActiveInteractionTool] = useState<Volume3DInteractionTool>("rotate");
  const [, setActivePreset] = useState<WindowPresetId>("bone");
  const [activeRenderMode, setActiveRenderMode] = useState<Volume3DRenderMode>("bone");
  const [isLoading, setIsLoading] = useState(true);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [renderModeMessage, setRenderModeMessage] = useState<string | null>(null);
  const activePresetRef = useRef<WindowPresetId>("bone");
  const activeRenderModeRef = useRef<Volume3DRenderMode>("bone");
  const handledActionRequestIdRef = useRef<number | null>(null);
  const isSceneReadyRef = useRef(false);
  const setupTokenRef = useRef(0);
  const viewportRef = useRef<ResettableViewport | null>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const toolGroupRef = useRef<CornerstoneToolGroup | null>(null);

  const applyVolumeRenderMode = (mode: Exclude<Volume3DRenderMode, "voxel-debug">) => {
    const viewport = viewportRef.current;

    activeRenderModeRef.current = mode;
    setActiveRenderMode(mode);
    setRenderModeMessage(null);
    activePresetRef.current = getVolume3DRenderModeConfig(mode).presetId;
    setActivePreset(activePresetRef.current);

    if (!viewport) {
      return null;
    }

    try {
      const appliedConfig = applyVolume3DRenderModeToViewport(viewport, mode, volumeId);

      renderingEngineRef.current?.renderViewports([viewportId]);
      debug3D("render mode applied", {
        blendMode: appliedConfig.blendMode,
        mode,
        presetName: appliedConfig.presetName,
        sampleDistanceMultiplier: appliedConfig.sampleDistanceMultiplier,
        updatedActors: appliedConfig.updatedActors,
      });

      return appliedConfig;
    } catch (renderModeError) {
      if (import.meta.env.DEV) {
        console.warn("[3D Viewer] render mode failed", renderModeError);
      }

      setError(
        renderModeError instanceof Error
          ? renderModeError.message || "Preset 3D indisponible."
          : "Preset 3D indisponible.",
      );
      return null;
    }
  };

  const reset3DView = () => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    try {
      viewport.resetCamera?.({
        resetPan: true,
        resetToCenter: true,
        resetZoom: true,
      });
      if (activeRenderModeRef.current !== "voxel-debug") {
        applyVolume3DRenderModeToViewport(viewport, activeRenderModeRef.current, volumeId);
      }
      viewport.render?.();
      renderingEngineRef.current?.renderViewports([viewportId]);
      debug3D("camera reset");
    } catch (resetError) {
      if (import.meta.env.DEV) {
        console.warn("[3D Viewer] reset failed", resetError);
      }
    }
  };

  const capture3DViewport = () => {
    const canvas = elementRef.current?.querySelector("canvas");

    if (!canvas) {
      setError("Capture 3D indisponible : aucun canvas trouvé.");
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        setError("Capture 3D indisponible.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "hekia-capture.png";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  const applyRenderMode = (mode: Volume3DRenderMode) => {
    activeRenderModeRef.current = mode;
    setActiveRenderMode(mode);

    if (mode === "voxel-debug") {
      setRenderModeMessage(
        "Rendu voxel brut à brancher : Cornerstone affiche un volume rendering lissé, pas des cubes.",
      );
      return;
    }
    applyVolumeRenderMode(mode);
  };

  const handle3DWheel = (event: WheelEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    event.preventDefault();

    try {
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
      const currentZoom = viewport.getZoom?.();

      if (typeof currentZoom === "number" && viewport.setZoom) {
        viewport.setZoom(Math.max(0.01, currentZoom * zoomFactor));
      } else {
        const camera = viewport.getCamera?.();

        if (camera?.parallelScale && viewport.setCamera) {
          viewport.setCamera({
            parallelScale: Math.max(0.01, camera.parallelScale / zoomFactor),
          });
        }
      }

      viewport.render?.();
      renderingEngineRef.current?.renderViewports([viewportId]);
    } catch (zoomError) {
      if (import.meta.env.DEV) {
        console.warn("[3D Viewer] wheel zoom failed", zoomError);
      }
    }
  };

  useEffect(() => {
    const toolGroup = toolGroupRef.current;

    if (!toolGroup) {
      return;
    }

    try {
      setVolume3DPrimaryTool(toolGroup, activeInteractionTool);
    } catch (toolError) {
      if (import.meta.env.DEV) {
        console.warn("[3D Viewer] tool activation failed", toolError);
      }
    }
  }, [activeInteractionTool]);

  useEffect(() => {
    if (!actionRequest || handledActionRequestIdRef.current === actionRequest.id) {
      return;
    }

    handledActionRequestIdRef.current = actionRequest.id;

    if (actionRequest.action === "capture") {
      capture3DViewport();
      return;
    }

    if (actionRequest.action === "reset") {
      reset3DView();
      return;
    }

    if (actionRequest.action === "undo") {
      setRenderModeMessage("Aucune annotation 3D à supprimer.");
    }
  }, [actionRequest]);

  useEffect(() => {
    setupTokenRef.current += 1;
    const setupToken = setupTokenRef.current;
    let isCancelled = false;
    let renderingEngine: RenderingEngine | null = null;
    let timeoutId = 0;
    const element = elementRef.current;

    if (!element) {
      setError("Viewport 3D indisponible.");
      setIsLoading(false);
      return;
    }

    const viewportElement = element;
    const handleContextLost = (event: Event) => {
      event.preventDefault();

      if (isCancelled || setupToken !== setupTokenRef.current) {
        return;
      }

      setError("La 3D a perdu son contexte WebGL. Revenez en MPR.");
      setIsLoading(false);
      onRenderError?.();
    };

    viewportElement.addEventListener("webglcontextlost", handleContextLost);

    async function setup() {
      setError(null);
      setIsLoading(true);
      setIsSceneReady(false);
      isSceneReadyRef.current = false;
      viewportRef.current = null;
      renderingEngineRef.current = null;
      toolGroupRef.current = null;
      ToolGroupManager.destroyToolGroup(toolGroupId);
      timeoutId = window.setTimeout(() => {
        if (!isSceneReadyRef.current && !isCancelled && setupToken === setupTokenRef.current) {
          setError("Le rendu 3D n'a pas pu être affiché. Revenez en MPR ou essayez un autre navigateur.");
          setIsLoading(false);
          onRenderError?.();
        }
      }, 10000);

      try {
        const rect = await waitForElementSize(viewportElement);
        debug3D("step", { elementSize: { height: rect.height, width: rect.width } });
        await initCornerstone();
        debug3D("step", { step: "init ok" });

        if (isCancelled || setupToken !== setupTokenRef.current) {
          return;
        }

        renderingEngine = new RenderingEngine(renderingEngineId);
        renderingEngineRef.current = renderingEngine;
        debug3D("renderingEngine created");

        renderingEngine.enableElement({
          defaultOptions: {
            background: [0, 0, 0] as Types.Point3,
          },
          element: viewportElement,
          type: Enums.ViewportType.VOLUME_3D,
          viewportId,
        });
        debug3D("viewport enabled");

        const viewport = renderingEngine.getViewport(viewportId) as ResettableViewport;
        viewportRef.current = viewport;
        const imageIds = await createNiftiImageIds(source.url);
        debug3D("imageIds", { imageIdsCount: imageIds.length });
        debug3D("setup", {
          imageIdsCount: imageIds.length,
          renderingEngineId,
          source,
          volumeId,
          volumeUrl: source.url,
          viewportId,
        });

        if (!imageIds.length) {
          throw new Error("Aucune image NIfTI exploitable pour le rendu 3D.");
        }

        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

        if (toolGroup) {
          toolGroupRef.current = toolGroup;
          toolGroup.addTool(TrackballRotateTool.toolName);
          toolGroup.addTool(PanTool.toolName);
          toolGroup.addTool(ZoomTool.toolName);
          toolGroup.addViewport(viewportId, renderingEngineId);
          setVolume3DPrimaryTool(toolGroup, activeInteractionTool);
        }

        const volume = await volumeLoader.createAndCacheVolume(volumeId, {
          imageIds,
        });
        debug3D("volume created");

        await volume.load();
        debug3D("step", { step: "volume loaded" });

        if (isCancelled || setupToken !== setupTokenRef.current) {
          requestAnimationFrame(() => renderingEngine?.destroy());
          renderingEngine = null;
          ToolGroupManager.destroyToolGroup(toolGroupId);
          return;
        }

        const initialRenderMode =
          activeRenderModeRef.current === "voxel-debug" ? "bone" : activeRenderModeRef.current;
        const initialRenderModeConfig = getVolume3DRenderModeConfig(initialRenderMode);

        await addVolumesToViewports(
          renderingEngine,
          [
            {
              blendMode: initialRenderModeConfig.blendMode,
              volumeId,
            },
          ],
          [viewportId],
        );
        debug3D("step", { step: "volume added" });

        viewport.resetCamera?.({
          resetPan: true,
          resetToCenter: true,
          resetZoom: true,
        });
        debug3D("camera reset");
        const appliedRenderMode = applyVolume3DRenderModeToViewport(
          viewport,
          initialRenderMode,
          volumeId,
        );
        debug3D("render mode applied", {
          blendMode: appliedRenderMode.blendMode,
          mode: initialRenderMode,
          presetName: appliedRenderMode.presetName,
          sampleDistanceMultiplier: appliedRenderMode.sampleDistanceMultiplier,
          updatedActors: appliedRenderMode.updatedActors,
        });
        renderingEngine.resize(true, false);
        if (isCancelled || setupToken !== setupTokenRef.current) {
          return;
        }

        const collectRenderDiagnostics = async (label: string) => {
          const immediateDiagnostics = inspectVolume3DRender(viewportElement, viewport, volumeId);

          debug3D(`${label} immediate diagnostics`, immediateDiagnostics);
          await waitForFinalPaint();
          const paintedDiagnostics = inspectVolume3DRender(viewportElement, viewport, volumeId);

          debug3D(`${label} diagnostics`, paintedDiagnostics);

          if (immediateDiagnostics.hasNonBlackPixel === true) {
            return {
              ...paintedDiagnostics,
              hasNonBlackPixel: true,
              sampledPixels: immediateDiagnostics.sampledPixels,
            };
          }

          if (
            paintedDiagnostics.hasNonBlackPixel === null &&
            immediateDiagnostics.hasNonBlackPixel !== null
          ) {
            return immediateDiagnostics;
          }

          return paintedDiagnostics;
        };

        viewport.render?.();
        renderingEngine.renderViewports([viewportId]);
        debug3D("step", { step: "render done" });

        let diagnostics = await collectRenderDiagnostics("render");

        if (diagnostics.actorCount === 0) {
          if (!isCancelled && setupToken === setupTokenRef.current) {
            setError("Le volume 3D est chargé mais aucun acteur volume n'est attaché au viewport.");
          }
          return;
        }

        if (diagnostics.canvasCount === 0) {
          if (!isCancelled && setupToken === setupTokenRef.current) {
            setError("Le volume 3D est chargé mais aucun canvas WebGL n'a été créé.");
          }
          return;
        }

        if (diagnostics.hasNonBlackPixel === false) {
          const fallbackModes = (["mip", "soft", "bone"] as const).filter(
            (mode) => mode !== initialRenderMode,
          );

          for (const fallbackMode of fallbackModes) {
            if (isCancelled || setupToken !== setupTokenRef.current) {
              return;
            }

            const fallbackConfig = applyVolume3DRenderModeToViewport(viewport, fallbackMode, volumeId);

            activeRenderModeRef.current = fallbackMode;
            activePresetRef.current = fallbackConfig.presetId;
            setActiveRenderMode(fallbackMode);
            setActivePreset(fallbackConfig.presetId);
            renderingEngine.resize(true, false);
            viewport.render?.();
            renderingEngine.renderViewports([viewportId]);
            debug3D("fallback render mode applied", {
              blendMode: fallbackConfig.blendMode,
              mode: fallbackMode,
              presetName: fallbackConfig.presetName,
              sampleDistanceMultiplier: fallbackConfig.sampleDistanceMultiplier,
              updatedActors: fallbackConfig.updatedActors,
            });
            diagnostics = await collectRenderDiagnostics(`fallback ${fallbackMode}`);

            if (diagnostics.hasNonBlackPixel !== false) {
              setRenderModeMessage(`Rendu 3D affiché avec le preset ${fallbackMode}.`);
              break;
            }
          }
        }

        if (diagnostics.hasNonBlackPixel === false) {
          if (!isCancelled && setupToken === setupTokenRef.current) {
            setError(
              "Le volume 3D est chargé mais le rendu est noir. Preset/transfer function à corriger.",
            );
          }
          return;
        }

        if (!isCancelled && setupToken === setupTokenRef.current) {
          setError(null);
          isSceneReadyRef.current = true;
          setIsSceneReady(true);
        }
      } catch (setupError) {
        const engineToDestroy = renderingEngine;

        requestAnimationFrame(() => {
          try {
            engineToDestroy?.destroy();
          } catch (cleanupError) {
            debug3D("cleanup ignored", {
              message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
          }
        });
        renderingEngine = null;
        renderingEngineRef.current = null;
        viewportRef.current = null;
        toolGroupRef.current = null;
        ToolGroupManager.destroyToolGroup(toolGroupId);

        if (!isCancelled && setupToken === setupTokenRef.current) {
          setError(
            setupError instanceof Error
              ? setupError.message || "Rendu 3D indisponible."
              : "Rendu 3D indisponible.",
          );
          onRenderError?.();
        }
      } finally {
        if (!isCancelled && setupToken === setupTokenRef.current) {
          setIsLoading(false);
        }
        window.clearTimeout(timeoutId);
      }
    }

    void setup();

    return () => {
      isCancelled = true;
      setupTokenRef.current += 1;
      window.clearTimeout(timeoutId);
      viewportElement.removeEventListener("webglcontextlost", handleContextLost);
      isSceneReadyRef.current = false;
      viewportRef.current = null;
      renderingEngineRef.current = null;
      toolGroupRef.current = null;
      requestAnimationFrame(() => {
        try {
          ToolGroupManager.destroyToolGroup(toolGroupId);
          renderingEngine?.destroy();
        } catch (cleanupError) {
          debug3D("cleanup ignored", {
            message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        }
      });
    };
  }, [onRenderError, renderingEngineId, source.url, toolGroupId, viewportId, volumeId]);

  return (
    <div className={cn("flex h-full w-full flex-col bg-viewer", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft bg-surface-100 p-2">
        <div>
          <p className="text-sm font-semibold text-text">Rendu 3D voxel</p>
          <p className="text-xs text-text-muted">Moteur 3D séparé du MPR</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {interactionTools.map((tool) => (
              <Button
                className="h-8"
                key={tool.id}
                onClick={() => setActiveInteractionTool(tool.id)}
                size="sm"
                variant={activeInteractionTool === tool.id ? "primary" : "ghost"}
              >
                {tool.label}
              </Button>
            ))}
            <Button className="h-8" onClick={reset3DView} size="sm" variant="ghost">
              Reset 3D
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {renderModes.map((mode) => (
              <Button
                className="h-8"
                key={mode.id}
                onClick={() => applyRenderMode(mode.id)}
                size="sm"
                variant={activeRenderMode === mode.id ? "primary" : "ghost"}
              >
                {mode.label}
              </Button>
            ))}
          </div>
          <Button onClick={onBackToMpr} size="sm" variant="outline">
            Retour MPR
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 w-full flex-1 bg-black">
        <div className="h-full w-full" onWheel={handle3DWheel} ref={elementRef} />

        {renderModeMessage ? (
          <div className="absolute left-3 top-3 z-10 rounded bg-black/70 px-3 py-2 text-xs text-text-soft">
            {renderModeMessage}
          </div>
        ) : null}

        {!error && (isLoading || !isSceneReady) ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-viewer">
            <div className="rounded-xl border border-border-soft bg-surface p-6 shadow-xl">
              <LoadingState label="Chargement rendu 3D..." />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-viewer">
            <div className="max-w-md rounded-lg border border-quaternary-700 bg-surface p-5 text-center">
              <p className="text-sm font-semibold text-quaternary-100">{error}</p>
              <p className="mt-3 text-xs leading-relaxed text-text-muted">
                Le rendu 3D peut dépendre du navigateur et du support WebGL. Essayez Chromium si Firefox ne l'affiche pas.
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
