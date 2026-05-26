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

import type { InputHTMLAttributes } from "react";
import { useId } from "react";

import { cn } from "../../helpers/Cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export function Input({
  className,
  error,
  hint,
  id,
  label,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const descriptionId = `${inputId}-description`;
  const hasDescription = Boolean(error || hint);

  return (
    <div className="space-y-1.5">
      {label ? (
        <label className="block text-sm font-medium text-contrast-200" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        aria-describedby={hasDescription ? descriptionId : undefined}
        aria-invalid={Boolean(error)}
        className={cn(
          "h-10 w-full rounded-lg border border-contrast-600 bg-dark-contrast px-3 text-sm text-white outline-none transition placeholder:text-contrast-500 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-quaternary focus:border-quaternary",
          className,
        )}
        id={inputId}
        {...props}
      />
      {hasDescription ? (
        <p
          className={cn("text-xs text-contrast-400", error && "text-quaternary-200")}
          id={descriptionId}
        >
          {error || hint}
        </p>
      ) : null}
    </div>
  );
}
