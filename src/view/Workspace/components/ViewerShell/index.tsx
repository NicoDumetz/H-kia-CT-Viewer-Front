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

import type { ReactNode } from "react";

type ViewerShellProps = {
  center: ReactNode;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  toolbar: ReactNode;
  error?: string | null;
};

export function ViewerShell({
  center,
  error,
  leftPanel,
  rightPanel,
  toolbar,
}: ViewerShellProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background font-manrope text-text">
      {toolbar}

      {error ? (
        <div className="border-b border-quaternary-700 bg-quaternary-700/20 px-3 py-1.5 text-center text-xs text-quaternary-100">
          {error}
        </div>
      ) : null}

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {leftPanel}
        <section className="min-w-0 flex-1 bg-viewer">{center}</section>
        {rightPanel}
      </main>
    </div>
  );
}
