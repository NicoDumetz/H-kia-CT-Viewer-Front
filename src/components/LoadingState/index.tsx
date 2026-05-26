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

type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Chargement" }: LoadingStateProps) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-3 text-sm text-contrast-300">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <span>{label}</span>
    </div>
  );
}
