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

type CardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export function Card({
  children,
  className,
  description,
  footer,
  title,
}: CardProps) {
  const hasHeader = Boolean(title || description);

  return (
    <section
      className={cn(
        "rounded-xl border border-contrast-600 bg-dark-shade p-4",
        className,
      )}
    >
      {hasHeader ? (
        <header className="mb-4 space-y-1">
          {title ? <h3 className="text-sm font-semibold text-white">{title}</h3> : null}
          {description ? (
            <p className="text-sm text-contrast-400">{description}</p>
          ) : null}
        </header>
      ) : null}
      <div>{children}</div>
      {footer ? (
        <footer className="mt-4 border-t border-contrast-700 pt-4">{footer}</footer>
      ) : null}
    </section>
  );
}
