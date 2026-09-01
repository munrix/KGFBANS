// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * KGF button.
 *
 * Every button carries the identity's three signatures: wide-tracked uppercase
 * Aeonik, a single angled cut on the top-right corner, and a hard poster
 * shadow that lifts on hover and stamps flush on press (`.kgf-press`).
 *
 * Blaze orange is the default because the guidelines assign it to action
 * items; lava red is the heavier "core energy" accent, used for destructive
 * and for the primary weight in a two-button pair.
 */
const buttonVariants = cva(
  "kgf-press inline-flex items-center justify-center gap-2 whitespace-nowrap font-display font-bold uppercase tracking-[0.06em] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--kgf-blaze)] focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "kgf-cut-sm bg-[var(--kgf-blaze)] text-white shadow-[var(--shadow-hard-sm)] hover:bg-[var(--kgf-blaze-light)] active:bg-[var(--kgf-blaze-dark)]",
        primary:
          "kgf-cut-sm bg-[var(--kgf-lava)] text-white shadow-[var(--shadow-hard-sm)] hover:bg-[var(--kgf-lava-light)] active:bg-[var(--kgf-lava-dark)]",
        gradient:
          "kgf-cut-sm bg-[image:var(--gradient-flame)] text-white shadow-[var(--shadow-hard-sm)]",
        soft: "kgf-cut-sm bg-[var(--kgf-peach)] text-black shadow-[var(--shadow-hard-sm)] hover:bg-[var(--kgf-peach-light)]",
        destructive:
          "kgf-cut-sm bg-[var(--kgf-lava)] text-white shadow-[var(--shadow-hard-sm)] hover:bg-[var(--kgf-lava-light)] active:bg-[var(--kgf-lava-dark)]",
        outline:
          "kgf-cut-sm border-2 border-[var(--border-strong)] bg-transparent text-white hover:border-[var(--kgf-blaze)] hover:text-[var(--kgf-blaze)]",
        secondary:
          "kgf-cut-sm bg-[var(--kgf-gray-700)] text-white hover:bg-[var(--kgf-gray-600)]",
        ghost: "text-white hover:bg-[var(--border-default)]",
        link: "text-[var(--kgf-blaze)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6 text-sm",
        sm: "h-9 px-4 text-xs",
        lg: "h-13 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
