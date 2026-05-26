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

type ErrorStateProps = {
  title?: string;
  message?: string;
  action?: ReactNode;
};

export function ErrorState({
  action,
  message = "Une erreur est survenue.",
  title = "Erreur",
}: ErrorStateProps) {
  return (
    <div className="rounded-xl border border-quaternary-700 bg-dark-contrast p-4 text-center">
      <h3 className="text-sm font-semibold text-quaternary-100">{title}</h3>
      <p className="mt-2 text-sm text-contrast-300">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
