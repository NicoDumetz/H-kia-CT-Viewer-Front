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

import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "~/helpers/Cn";
import type { WindowPresetId } from "../CornerstoneViewer";

export type ViewportGridLayout = "mpr" | "axial" | "sagittal" | "coronal";

type ViewportGridProps = {
  children: ReactNode;
  isHidden?: boolean;
  layout: ViewportGridLayout;
};

type ViewportFrameProps = HTMLAttributes<HTMLDivElement> & {
  dimensions?: string;
  isActive?: boolean;
  label: string;
  scroller?: ReactNode;
  segmentationStatus?: string;
  sliceLabel?: string;
  windowPreset?: WindowPresetId;
  zoomLabel?: string;
};

function getGridClassName(layout: ViewportGridLayout) {
  if (layout === "mpr") {
    return "grid grid-cols-2 grid-rows-2";
  }

  return "grid grid-cols-1 grid-rows-1";
}

export function getViewportGridItemClassName(
  layout: ViewportGridLayout,
  viewportKey: Exclude<ViewportGridLayout, "mpr">,
) {
  if (layout !== "mpr" && layout !== viewportKey) {
    return "hidden";
  }

  if (layout === "mpr" && viewportKey === "coronal") {
    return "col-span-2";
  }

  return "";
}

export function ViewportGrid({ children, isHidden = false, layout }: ViewportGridProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 gap-1 bg-black p-1",
        getGridClassName(layout),
        isHidden && "invisible pointer-events-none",
      )}
    >
      {children}
    </div>
  );
}

export function ViewportFrame({
  children,
  className,
  dimensions,
  isActive = false,
  label,
  scroller,
  segmentationStatus,
  sliceLabel,
  windowPreset,
  zoomLabel,
  ...props
}: ViewportFrameProps) {
  return (
    <div
      className={cn(
        "relative min-h-0 overflow-hidden rounded border bg-black",
        isActive ? "border-primary/80 shadow-[inset_0_0_0_1px_rgba(35,123,227,0.55)]" : "border-border-soft",
        className,
      )}
      {...props}
    >
      <div className="pointer-events-none absolute left-2 right-11 top-2 z-10 flex items-start justify-between gap-2">
        <div className="rounded bg-black/65 px-2 py-1 text-[11px] font-semibold leading-4 text-text-soft">
          <span className="text-text">{label}</span>
          {sliceLabel ? <span className="ml-2 text-text-muted">{sliceLabel}</span> : null}
        </div>

        <div className="hidden rounded bg-black/65 px-2 py-1 text-right text-[10px] leading-4 text-text-muted xl:block">
          {dimensions ? <p>{dimensions}</p> : null}
          {windowPreset ? <p>WL {windowPreset.toUpperCase()}</p> : null}
          {zoomLabel ? <p>{zoomLabel}</p> : null}
          {segmentationStatus ? <p>{segmentationStatus}</p> : null}
        </div>
      </div>

      {children}

      {scroller ? (
        <div className="absolute bottom-2 right-2 top-2 z-30">{scroller}</div>
      ) : null}
    </div>
  );
}
