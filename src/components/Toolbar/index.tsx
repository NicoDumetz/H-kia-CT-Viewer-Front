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

import type { ReactNode } from "react";

import { cn } from "../../helpers/Cn";

type ToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border border-contrast-700 bg-dark-contrast p-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
