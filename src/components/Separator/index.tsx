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
// Created     : Tuesday May 26 2026
//
// =============================================================

import { cn } from "../../helpers/Cn";

type SeparatorProps = {
  orientation?: "horizontal" | "vertical";
  className?: string;
};

export function Separator({
  className,
  orientation = "horizontal",
}: SeparatorProps) {
  const isVertical = orientation === "vertical";

  return (
    <div
      aria-orientation={orientation}
      className={cn(
        "shrink-0 bg-contrast-700",
        isVertical ? "h-6 w-px" : "h-px w-full",
        className,
      )}
      role="separator"
    />
  );
}
