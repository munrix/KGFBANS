// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

/**
 * A team's crest, in a fixed square frame.
 *
 * Crests arrive from the teams themselves and are all over the place — some
 * are transparent marks, some are full artwork squares with their own dark or
 * white backing. `scripts/normalize-assets.mjs` squares them all off, and this
 * frames them identically so a row of them reads as one set.
 *
 * A name with no crest on file falls back to its initials rather than a broken
 * image, which matters most on air: a roster typed in a hurry at the desk must
 * never leave a hole in the overlay.
 */

import React, { useState } from "react";
import { CDN } from "@/lib/cdn";

/** First letters of the first two words — "Red Zone Esports" -> "RZ". */
const initialsOf = (name: string) =>
  name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "?";

export const TeamCrest = ({
  name,
  size = 40,
  className = "",
}: {
  name: string;
  /** Rendered edge length in px. The source is 512² so any size is sharp. */
  size?: number;
  className?: string;
}) => {
  /**
   * Which name failed to resolve, rather than a plain flag: a rename points at
   * a different file that may well exist, and the crest has to try again for
   * it instead of staying hidden for the rest of the show.
   */
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const failed = failedFor === name;

  const frame = `relative shrink-0 overflow-hidden rounded-[6px] ${className}`;
  const style = { width: size, height: size };

  if (!name || failed) {
    return (
      <div
        className={`${frame} grid place-items-center border border-[var(--border-default)] bg-[var(--kgf-gray-800)]`}
        style={style}
        aria-hidden
      >
        <span
          className="font-display font-bold leading-none text-[var(--kgf-gray-300)]"
          style={{ fontSize: Math.max(10, size * 0.36) }}
        >
          {initialsOf(name || "")}
        </span>
      </div>
    );
  }

  return (
    <div className={frame} style={style}>
      {/*
        A plain <img>, not next/image: the source is a runtime-resolved CDN
        path that may not exist, and only the native element gives a reliable
        error hook to fall back on.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CDN.team(name)}
        alt={name}
        width={size}
        height={size}
        onError={() => setFailedFor(name)}
        className="h-full w-full object-contain"
      />
    </div>
  );
};

export default TeamCrest;
