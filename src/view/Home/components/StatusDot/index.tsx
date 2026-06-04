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

import { cn } from "../../../../helpers/Cn";

type StatusDotStatus = "idle" | "running" | "success" | "warning" | "error";

type StatusDotProps = {
  status: StatusDotStatus;
  label?: string;
};

const statusClasses: Record<StatusDotStatus, string> = {
  idle: "bg-contrast-500",
  running: "bg-primary",
  success: "bg-secondary",
  warning: "bg-warning",
  error: "bg-quaternary",
};

export function StatusDot({ label, status }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-contrast-300">
      <span className={cn("h-2.5 w-2.5 rounded-full", statusClasses[status])} />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
