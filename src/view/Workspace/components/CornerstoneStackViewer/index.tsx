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

import { Enums, RenderingEngine } from "@cornerstonejs/core";
import type { Types } from "@cornerstonejs/core";
import {
  Enums as ToolEnums,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
} from "@cornerstonejs/tools";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { WheelEvent } from "react";

import { Button } from "~/components/Button";
import { LoadingState } from "~/components/LoadingState";
import { Toolbar } from "~/components/Toolbar";
import { SliceScrollBar } from "../SliceScrollBar";
import { ViewportFrame } from "../ViewportGrid";
import { cornerstoneToolGroupId, initCornerstone } from "~/helpers/Cornerstone";
import { cn } from "~/helpers/Cn";
import type { WindowPresetId } from "../CornerstoneViewer";

type WindowPreset = {
  id: WindowPresetId;
  label: string;
  width: number;
  level: number;
};

type StackViewport = Types.IViewport & {
  setStack: (imageIds: string[], currentImageIdIndex?: number) => Promise<void>;
  setProperties: (properties: { voiRange: { lower: number; upper: number } }) => void;
};

type CornerstoneStackViewerProps = {
  imageIds: string[];
  isMaskVisible?: boolean;
  segmentationUrl?: string | null;
  showControls?: boolean;
  windowPreset?: WindowPresetId;
  onWindowPresetChange?: (preset: WindowPresetId) => void;
  className?: string;
};

const windowPresets: WindowPreset[] = [
  {
    id: "soft",
    label: "Soft",
    width: 400,
    level: 40,
  },
  {
    id: "bone",
    label: "Bone",
    width: 2000,
    level: 500,
  },
  {
    id: "lung",
    label: "Lung",
    width: 1500,
    level: -600,
  },
];

function getVoiRange(preset: WindowPreset) {
  const halfWidth = preset.width / 2;

  return {
    lower: preset.level - halfWidth,
    upper: preset.level + halfWidth,
  };
}

function getPreset(presetId: WindowPresetId) {
  return windowPresets.find((item) => item.id === presetId) || windowPresets[0];
}

function applyWindowPreset(viewport: StackViewport | null, presetId: WindowPresetId) {
  if (!viewport) {
    return;
  }

  viewport.setProperties({
    voiRange: getVoiRange(getPreset(presetId)),
  });
  viewport.render();
}

export function CornerstoneStackViewer({
  className,
  imageIds,
  isMaskVisible = true,
  onWindowPresetChange,
  segmentationUrl,
  showControls = true,
  windowPreset,
}: CornerstoneStackViewerProps) {
  const reactId = useId().replace(/:/g, "");
  const renderingEngineId = `hekia-stack-rendering-engine-${reactId}`;
  const toolGroupId = `${cornerstoneToolGroupId}-stack-${reactId}`;
  const viewportId = `hekia-stack-viewport-${reactId}`;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const renderingEngineRef = useRef<RenderingEngine | null>(null);
  const viewportRef = useRef<StackViewport | null>(null);
  const setupTokenRef = useRef(0);
  const isRenderingReadyRef = useRef(false);
  const activePresetRef = useRef<WindowPresetId>(windowPreset || "soft");
  const [internalPreset, setInternalPreset] = useState<WindowPresetId>("soft");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sliceIndex, setSliceIndex] = useState(0);
  const activePreset = windowPreset || internalPreset;

  const setPreset = useCallback((presetId: WindowPresetId) => {
    activePresetRef.current = presetId;
    setInternalPreset(presetId);
    onWindowPresetChange?.(presetId);
    applyWindowPreset(viewportRef.current, presetId);
  }, [onWindowPresetChange]);

  const scrollStack = useCallback((delta: number) => {
    const viewport = viewportRef.current as (StackViewport & {
      scroll?: (delta?: number) => void;
    }) | null;

    if (!delta || !viewport?.scroll) {
      return;
    }

    viewport.scroll(delta);
    viewport.render();
    setSliceIndex((currentIndex) =>
      Math.max(0, Math.min(Math.max(0, imageIds.length - 1), currentIndex + delta)),
    );
  }, [imageIds.length]);

  const handleViewportWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const delta = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;

    if (!delta) {
      return;
    }

    event.preventDefault();
    scrollStack(delta);
  }, [scrollStack]);

  const handleSliceChange = useCallback((nextSliceIndex: number) => {
    const delta = nextSliceIndex - sliceIndex;

    scrollStack(delta);
  }, [scrollStack, sliceIndex]);

  useEffect(() => {
    setupTokenRef.current += 1;
    const setupToken = setupTokenRef.current;
    let isCancelled = false;
    let renderingEngine: RenderingEngine | null = null;
    const resizeObserver = new ResizeObserver(() => {
      const currentRenderingEngine = renderingEngineRef.current;

      if (!isRenderingReadyRef.current || !currentRenderingEngine) {
        return;
      }

      try {
        currentRenderingEngine.resize(true, false);
      } catch {
        // Resize can fire after teardown on rapid route/layout changes.
      }
    });
    const timeout = window.setTimeout(() => {
      if (!isCancelled && setupToken === setupTokenRef.current) {
        setError("Chargement DICOM trop long. Preparez le volume ou importez une serie DICOM valide.");
        setIsLoading(false);
      }
    }, 15000);

    async function setup() {
      setIsLoading(true);
      setError(null);
      isRenderingReadyRef.current = false;
      renderingEngineRef.current = null;
      viewportRef.current = null;
      ToolGroupManager.destroyToolGroup(toolGroupId);

      try {
        if (!imageIds.length) {
          throw new Error("Aucune image DICOM exploitable. Le DICOMDIR seul ne contient pas de pixels affichables.");
        }

        const element = elementRef.current;

        if (!element) {
          throw new Error("Aucun viewport disponible pour la stack DICOM.");
        }

        await initCornerstone();

        if (isCancelled || setupToken !== setupTokenRef.current) {
          return;
        }

        renderingEngine = new RenderingEngine(renderingEngineId);
        renderingEngine.setViewports([
          {
            element,
            type: Enums.ViewportType.STACK,
            viewportId,
            defaultOptions: {
              background: [0, 0, 0] as Types.Point3,
            },
          },
        ]);

        const viewport = renderingEngine.getViewport(viewportId) as StackViewport;
        const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

        if (!toolGroup) {
          throw new Error("Impossible de creer le tool group DICOM.");
        }

        toolGroup.addTool(WindowLevelTool.toolName);
        toolGroup.addTool(PanTool.toolName);
        toolGroup.addTool(ZoomTool.toolName);
        toolGroup.addTool(StackScrollTool.toolName);
        toolGroup.addViewport(viewportId, renderingEngineId);
        toolGroup.setToolActive(StackScrollTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Wheel }],
        });
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
        });

        await viewport.setStack(imageIds, 0);
        setSliceIndex(0);

        if (isCancelled || setupToken !== setupTokenRef.current) {
          renderingEngine.destroy();
          renderingEngine = null;
          ToolGroupManager.destroyToolGroup(toolGroupId);
          return;
        }

        applyWindowPreset(viewport, activePresetRef.current);
        viewport.render();

        if (!isCancelled && setupToken === setupTokenRef.current) {
          renderingEngineRef.current = renderingEngine;
          viewportRef.current = viewport;
          isRenderingReadyRef.current = true;
          resizeObserver.observe(element);
        }
      } catch (setupError) {
        resizeObserver.disconnect();
        isRenderingReadyRef.current = false;
        renderingEngine?.destroy();
        renderingEngine = null;
        renderingEngineRef.current = null;
        viewportRef.current = null;
        ToolGroupManager.destroyToolGroup(toolGroupId);

        if (!isCancelled && setupToken === setupTokenRef.current) {
          setError(
            setupError instanceof Error
              ? setupError.message || "Stack DICOM indisponible."
              : "Stack DICOM indisponible.",
          );
        }
      } finally {
        if (!isCancelled && setupToken === setupTokenRef.current) {
          window.clearTimeout(timeout);
          setIsLoading(false);
        }
      }
    }

    void setup();

    return () => {
      isCancelled = true;
      setupTokenRef.current += 1;
      window.clearTimeout(timeout);
      isRenderingReadyRef.current = false;
      resizeObserver.disconnect();
      renderingEngine?.destroy();
      renderingEngineRef.current?.destroy();
      renderingEngineRef.current = null;
      viewportRef.current = null;
      ToolGroupManager.destroyToolGroup(toolGroupId);
    };
  }, [imageIds, renderingEngineId, toolGroupId, viewportId]);

  useEffect(() => {
    if (!windowPreset) {
      return;
    }

    activePresetRef.current = windowPreset;
    applyWindowPreset(viewportRef.current, windowPreset);
  }, [windowPreset]);

  const shouldShowLoading = !error && (isLoading || !viewportRef.current);

  return (
    <div className={cn("flex h-full flex-col bg-viewer", className)}>
      {showControls ? (
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border-soft bg-surface-100 p-2">
        <Toolbar className="gap-1 border-0 bg-transparent">
          {windowPresets.map((preset) => (
            <Button
              className="h-8"
              key={preset.id}
              onClick={() => setPreset(preset.id)}
              size="sm"
              variant={activePreset === preset.id ? "primary" : "ghost"}
            >
              {preset.label}
            </Button>
          ))}
        </Toolbar>
      </div>
      ) : null}

      <div className="relative min-h-0 flex-1 bg-black p-1">
        {segmentationUrl ? (
          <div className="absolute right-3 top-3 z-10 max-w-xs rounded bg-black/70 px-2 py-1 text-xs font-medium text-text-soft">
            {isMaskVisible
              ? "Overlay masque non encore disponible dans le viewer."
              : "Overlay masque non branche."}
          </div>
        ) : null}

        <ViewportFrame
          className="h-full"
          label="DICOM"
          scroller={
            <SliceScrollBar
              current={sliceIndex}
              onChange={handleSliceChange}
              total={imageIds.length}
            />
          }
          sliceLabel={`${sliceIndex + 1}/${Math.max(1, imageIds.length)}`}
          windowPreset={activePreset}
        >
          <div className="h-full w-full" onWheel={handleViewportWheel} ref={elementRef} />
        </ViewportFrame>

        {shouldShowLoading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-viewer">
            <div className="rounded-xl border border-border-soft bg-surface p-6 shadow-xl">
              <LoadingState label="Chargement DICOM" />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="absolute bottom-4 left-4 z-30 max-w-xl rounded-lg border border-quaternary-700 bg-surface p-3 text-sm text-quaternary-100">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
