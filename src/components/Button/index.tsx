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

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger"
  | "ghost"
  | "outline"
  | "soft";

export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
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
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2.5 px-5 text-base",
};

export function Button({
  children,
  className,
  disabled,
  fullWidth = false,
  isLoading = false,
  leftIcon,
  rightIcon,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && "w-full",
        className,
      )}
      disabled={isDisabled}
      type={type}
      {...props}
    >
      {isLoading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading ? rightIcon : null}
    </button>
  );
}
