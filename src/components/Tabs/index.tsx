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

type TabItem = {
  label: string;
  value: string;
  disabled?: boolean;
};

type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
};

export function Tabs({ items, onChange, value }: TabsProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-dark-contrast p-1">
      {items.map((item) => {
        const isActive = item.value === value;

        return (
          <button
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
              isActive
                ? "bg-primary text-white"
                : "text-contrast-400 hover:text-white",
            )}
            disabled={item.disabled}
            key={item.value}
            onClick={() => onChange(item.value)}
            type="button"
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
