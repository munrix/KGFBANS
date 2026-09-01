// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import { motion } from "framer-motion";

export type OverlayShellProps = {
  motionKey: string;
  size?: "md" | "xl";
  children: React.ReactNode;
};

export function OverlayShell({
  motionKey,
  size = "md",
  children,
}: OverlayShellProps) {
  return (
    <motion.div
      key={motionKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-6 z-50"
    >
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
        className={
          size === "xl"
            ? "kgf-cut bg-[var(--surface-card)] border border-[var(--border-default)] p-5 shadow-[var(--shadow-hard-lg)] w-full max-w-5xl max-h-[85vh] overflow-y-auto"
            : "kgf-cut bg-[var(--surface-card)] border border-[var(--border-default)] p-6 shadow-[var(--shadow-hard-lg)] max-w-md w-full"
        }
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
