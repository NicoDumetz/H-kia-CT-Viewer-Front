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

import { cn } from "~/helpers/Cn";

type SliceScrollBarProps = {
  current: number;
  total: number;
  disabled?: boolean;
  onChange: (sliceIndex: number) => void;
  className?: string;
};

function clampSlice(value: number, total: number) {
  return Math.max(0, Math.min(Math.max(0, total - 1), value));
}

export function SliceScrollBar({
  className,
  current,
  disabled = false,
  onChange,
  total,
}: SliceScrollBarProps) {
  const safeTotal = Math.max(1, total);
  const safeCurrent = clampSlice(current, safeTotal);

  return (
    <div
      className={cn(
        "pointer-events-auto flex h-full w-9 flex-col items-center justify-between gap-2 rounded border border-border-soft bg-black/55 px-1.5 py-2 shadow-lg",
        disabled && "opacity-50",
        className,
      )}
    >
      <span className="text-[10px] font-semibold text-text-soft">{safeCurrent + 1}</span>
      <input
        aria-label="Défilement des slices"
        className="min-h-0 flex-1 accent-primary"
        disabled={disabled}
        max={safeTotal - 1}
        min={0}
        onChange={(event) => onChange(clampSlice(Number(event.target.value), safeTotal))}
        step={1}
        style={{ direction: "rtl", writingMode: "vertical-lr" }}
        type="range"
        value={safeCurrent}
      />
      <span className="text-[10px] font-semibold text-text-muted">{safeTotal}</span>
    </div>
  );
}
