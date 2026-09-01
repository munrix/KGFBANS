// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * KGF text input.
 *
 * Square, raised off the black canvas by a step of grey rather than a border
 * alone, and focused with blaze orange plus a soft ring — the one place the
 * system allows a glow, because a focus state has to read instantly.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2 text-base text-white transition-colors",
          "placeholder:text-[var(--kgf-gray-500)] placeholder:uppercase placeholder:tracking-[0.12em] placeholder:text-sm",
          "focus-visible:border-[var(--kgf-blaze)] focus-visible:shadow-[0_0_0_3px_rgba(233,70,9,0.22)] focus-visible:outline-hidden",
          "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
