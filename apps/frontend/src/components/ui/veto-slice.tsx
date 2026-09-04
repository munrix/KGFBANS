// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { CDN, slugify } from "../../lib/cdn";
import { mapLabel, modeLabel, sideLabel } from "../../lib/game-maps";

/**
 * One angled slice of the veto strip.
 *
 * The broadcast reference is a single unbroken band across the foot of the
 * frame, cut into leaning parallelograms — the same diagonal the KGF mark is
 * built from, repeated at furniture scale. A ban is drained to greyscale and
 * struck through; a pick keeps full colour and carries the flame gradient in
 * its label so the two never read the same at a glance.
 *
 * Steps the veto has not reached yet still render, as an empty slice holding
 * the KGF mark. That keeps the strip a fixed width for the whole veto, so the
 * band never grows or reflows mid-broadcast.
 */
export type VetoSliceVariant = "ban" | "pick" | "decider" | "empty";

export interface VetoSliceProps {
  variant: VetoSliceVariant;
  /** Map id — may be mode-qualified ("hardpoint:Den"). */
  mapName?: string;
  teamName?: string;
  gameName: string;
  /** Starting-side marker, picks only. Named per mode on Call of Duty. */
  side?: string;
  /** Team that chose the side, which in BO3/BO5 is not the map's picker. */
  sideTeamName?: string;
  /** Drives the reveal stagger. */
  index: number;
  width: number;
  height: number;
}

/** How far the top edge leans past the bottom, in px. */
export const SLICE_SKEW = 34;

const EASE = [0, 0, 0.2, 1] as const;

const LABELS: Record<VetoSliceVariant, string> = {
  ban: "Bans",
  pick: "Picks",
  decider: "Decider",
  empty: "",
};

export default function VetoSlice({
  variant,
  mapName = "",
  teamName,
  gameName,
  side,
  sideTeamName,
  index,
  width,
  height,
}: VetoSliceProps) {
  const displayName = mapLabel(mapName);
  const modeTag = modeLabel(mapName);
  const isBan = variant === "ban";
  const isEmpty = variant === "empty";
  const labelHeight = Math.round(height * 0.28);

  // The parallelogram: top edge pushed right, bottom edge flush left.
  const clip = `polygon(${SLICE_SKEW}px 0, 100% 0, ${width - SLICE_SKEW}px 100%, 0 100%)`;

  return (
    <motion.div
      className="relative shrink-0 overflow-hidden"
      style={{ width, height, clipPath: clip }}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE, delay: index * 0.03 }}
    >
      {/* Ground, so a slice never shows the gameplay feed through itself. */}
      <div className="absolute inset-0 bg-[var(--kgf-black)]" />

      {isEmpty ? (
        // Not yet reached: the mark alone, sitting on a near-black panel.
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--kgf-gray-900)]">
          <Image
            src="/brand/kgf-mark-white.png"
            alt=""
            width={Math.round(width * 0.42)}
            height={Math.round(width * 0.42)}
            className="opacity-[0.07]"
            style={{ objectFit: "contain" }}
          />
        </div>
      ) : (
        <>
          {/*
           * Panel head.
           *
           * The map's own photography carries this panel — a viewer should
           * recognise the map before they have read its name. The brand tint
           * therefore rides *over* the image rather than under it: a pick is
           * washed in the flame gradient, a decider in peach, and a ban is
           * drained to grey and pushed back, so the three read apart instantly
           * at broadcast distance without any of them losing the map.
           */}
          <div
            className="absolute inset-0"
            style={{
              bottom: labelHeight,
              overflow: "hidden",
              background: "var(--kgf-black)",
            }}
          >
            <Image
              src={CDN.map(gameName, slugify(displayName))}
              alt={displayName}
              fill
              priority
              draggable={false}
              sizes="320px"
              style={{
                objectFit: "cover",
                // A banned map is out of the series; it should look spent.
                filter: isBan
                  ? "grayscale(1) brightness(0.5) contrast(1.05)"
                  : "saturate(1.05) contrast(1.05)",
              }}
            />

            {/*
             * Brand wash. `soft-light` keeps the photograph's own detail and
             * shifts only its colour, which a flat alpha fill would flatten.
             */}
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background: isBan
                  ? "var(--kgf-gray-700)"
                  : variant === "decider"
                    ? "var(--kgf-peach-dark)"
                    : "var(--gradient-flame)",
                mixBlendMode: "soft-light",
                opacity: isBan ? 0.5 : 0.72,
              }}
            />

            {/*
             * The mark, small and low in the panel where the scrim already
             * darkens the art. The side callout owns the top edge, and the
             * band's title bar carries the festival at full size — here it is
             * only a corner stamp saying whose overlay this is.
             */}
            <Image
              src="/brand/kgf-mark-white.png"
              alt=""
              width={Math.round(width * 0.13)}
              height={Math.round(width * 0.13)}
              className="absolute bottom-3 left-3 z-10"
              style={{
                objectFit: "contain",
                opacity: isBan ? 0.35 : 0.7,
              }}
            />

            {/* Just enough to seat the label, kept to the lower half. */}
            <div
              className="absolute inset-x-0 bottom-0 h-1/2"
              style={{ background: "var(--gradient-protect)", opacity: 0.92 }}
            />

            {/*
             * Side callout, as the reference places it — a chip at the head of
             * the panel rather than inside the label bar, which at this slice
             * width would crowd the map name off the end.
             */}
            {side && side !== "DECIDER" && sideTeamName && (
              <div
                // Inset past the skew, or the cut corner eats the first letters.
                className="absolute top-0 bg-black/80 px-2 py-1 leading-none"
                style={{ left: SLICE_SKEW, right: 0 }}
              >
                <div className="kgf-eyebrow truncate text-[8px] text-[var(--kgf-peach)]">
                  {sideTeamName} picks
                </div>
                <div className="truncate font-display text-[13px] font-bold uppercase leading-none text-white">
                  {sideLabel(mapName, side)}
                </div>
              </div>
            )}

            {/*
             * The mode this map is played in.
             *
             * It sits on the panel rather than in the label bar below, because
             * the bar's right-hand end is inside the parallelogram's cut corner
             * — anything put there is drawn and then clipped straight off the
             * slice, which is exactly how this label went missing on air. Here
             * it has the scrimmed foot of the artwork to itself, and its right
             * edge is held a full skew clear of the cut.
             */}
            {modeTag && (
              <div
                className="absolute z-10 max-w-[70%] truncate bg-black/80 px-2 py-1 font-display text-[13px] font-bold uppercase leading-none tracking-[0.06em]"
                style={{
                  bottom: 10,
                  right: SLICE_SKEW,
                  color: isBan ? "var(--kgf-gray-300)" : "var(--kgf-peach)",
                }}
              >
                {modeTag}
              </div>
            )}

            {/* Struck through, so a ban is unmistakable at broadcast distance. */}
            {isBan && (
              <motion.div
                className="absolute left-[-10%] right-[-10%] top-1/2 h-[3px] origin-left"
                style={{ background: "var(--kgf-lava)", rotate: "-18deg" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: 0.3,
                  ease: EASE,
                  delay: index * 0.03 + 0.18,
                }}
              />
            )}
          </div>

          {/* Label bar */}
          <div
            className="absolute inset-x-0 bottom-0 flex items-center gap-2"
            style={{
              height: labelHeight,
              // The bar spans the full slice, but the parallelogram cuts a
              // wedge off its right-hand end — so the text is held clear of it.
              paddingLeft: 12,
              paddingRight: SLICE_SKEW + 12,
              background: isBan ? "var(--kgf-gray-900)" : "var(--kgf-black)",
              // Only a pick earns the flame edge along the top of its label.
              borderTop: `2px solid ${
                variant === "decider"
                  ? "var(--kgf-peach)"
                  : isBan
                    ? "var(--kgf-gray-700)"
                    : "var(--kgf-blaze)"
              }`,
            }}
          >
            {/* The mark stands in for a team crest — we only ever have names. */}
            <Image
              src="/brand/kgf-mark-white.png"
              alt=""
              width={22}
              height={22}
              className={isBan ? "opacity-40" : "opacity-90"}
              style={{ objectFit: "contain" }}
            />

            <div className="min-w-0 flex-1 leading-none">
              <div
                className="kgf-eyebrow truncate text-[10px]"
                style={{
                  color: isBan ? "var(--kgf-gray-400)" : "var(--kgf-peach)",
                }}
              >
                {teamName ? `${teamName} ${LABELS[variant]}` : LABELS[variant]}
              </div>
              <div
                className="truncate font-display text-[18px] font-bold uppercase leading-tight tracking-[-0.01em]"
                style={{
                  color: isBan ? "var(--kgf-gray-300)" : "var(--kgf-white)",
                }}
              >
                {displayName}
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
