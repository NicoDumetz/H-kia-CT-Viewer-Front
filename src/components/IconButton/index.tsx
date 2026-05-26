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

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../helpers/Cn";
import type { ButtonSize, ButtonVariant } from "../Button";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  label: string;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-600",
  secondary: "bg-secondary text-background hover:bg-secondary-500",
  tertiary: "bg-tertiary text-white hover:bg-tertiary-600",
  danger: "bg-quaternary text-white hover:bg-quaternary-500",
  ghost: "bg-transparent text-contrast-300 hover:bg-contrast-700",
  outline: "border border-contrast-600 text-contrast-100 hover:bg-contrast-700",
  soft: "bg-contrast-700 text-contrast-100 hover:bg-contrast-600",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-12 w-12 text-lg",
};

export function IconButton({
  children,
  className,
  disabled,
  label,
  size = "md",
  type = "button",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        className,
      )}
      disabled={disabled}
      title={label}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
