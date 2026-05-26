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

type PanelProps = {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Panel({
  actions,
  children,
  className,
  subtitle,
  title,
}: PanelProps) {
  const hasHeader = Boolean(title || subtitle || actions);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-contrast-700 bg-dark-contrast",
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex items-start justify-between gap-4 border-b border-contrast-700 px-4 py-3">
          <div className="min-w-0 space-y-1">
            {title ? <h2 className="truncate text-sm font-semibold text-white">{title}</h2> : null}
            {subtitle ? <p className="text-sm text-contrast-400">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}
