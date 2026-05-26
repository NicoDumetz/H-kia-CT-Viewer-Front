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

import type { ChangeEvent } from "react";
import { useId } from "react";

import { cn } from "../../helpers/Cn";

type SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

type SelectProps = {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
};

export function Select({
  error,
  hint,
  label,
  onChange,
  options,
  placeholder,
  value,
}: SelectProps) {
  const selectId = useId();
  const descriptionId = `${selectId}-description`;
  const hasDescription = Boolean(error || hint);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event.target.value);
  };

  return (
    <div className="space-y-1.5">
      {label ? (
        <label className="block text-sm font-medium text-contrast-200" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <select
        aria-describedby={hasDescription ? descriptionId : undefined}
        aria-invalid={Boolean(error)}
        className={cn(
          "h-10 w-full rounded-lg border border-contrast-600 bg-dark-contrast px-3 text-sm text-white outline-none transition focus:border-primary disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-quaternary focus:border-quaternary",
        )}
        id={selectId}
        onChange={handleChange}
        value={value || ""}
      >
        {placeholder ? (
          <option disabled value="">
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
