// =============================================================
//
// ██╗  ██╗███████╗██╗  ██╗██╗ █████╗
// ██║  ██║██╔════╝██║ ██╔╝██║██╔══██╗
// ███████║█████╗  █████╔╝ ██║███████║
// ██╔══██║██╔══╝  ██╔═██╗ ██║██╔══██║
// ██║  ██║███████╗██║  ██╗██║██║  ██║
// ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝
//
// File        : index.ts
// Project     : H-kia-CT-Viewer-Front
// Author      : Nicolas Dumetz
//
// Created     : Tuesday May 26 2026
//
// =============================================================

export interface CnValueMap {
  [className: string]: boolean | null | undefined;
}

export type CnValue = string | false | null | undefined | CnValueMap;

export function cn(...values: CnValue[]): string {
  const classNames: string[] = [];

  values.forEach((value) => {
    if (!value) {
      return;
    }

    if (typeof value === "string") {
      classNames.push(value);
      return;
    }

    Object.entries(value).forEach(([key, enabled]) => {
      if (enabled) {
        classNames.push(key);
      }
    });
  });

  return classNames.join(" ");
}
