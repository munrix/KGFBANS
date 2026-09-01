// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { CDN, slugify } from "../../lib/cdn";
import { mapLabel, modeShortLabel } from "../../lib/game-maps";

/**
 * The single broadcast card behind every veto action.
 *
 * Ban, pick and decider differ only in their label, palette and whether a side
 * marker is shown, so they all render through here — one place to restyle when
 * the look changes, and no risk of the three drifting apart.
 *
 * Shape language follows the KGF mark: a hard angular slice through the team
 * band and map image, a flame rule under the action label, and a flame edge
 * down the left of the whole card.
 */
export type VetoCardVariant = "ban" | "pick" | "decider";

export interface VetoCardProps {
  /** Action word shown large: BAN / PICK / DECIDER. */
  label: string;
  /** Name in the top band. Empty hides the band's text. */
  teamName?: string;
  /** Map id — may be mode-qualified ("hardpoint:Den"). */
  mapName: string;
  gameName: string;
  variant: VetoCardVariant;
  /** Attack/defense marker, picks only. */
  side?: string;
  cardColors: {
    text: string[]; // [team, action, map]
    bg: string[]; // [band, image backing, bottom, rule]
  };
  /** Element key the admin colour editor is currently hovering. */
  highlightElement?: string;
}

// KGF motion tokens, mirrored from tokens.css for framer-motion.
const EASE = [0.2, 0.8, 0.2, 1] as const;
const DURATION = 0.36;

export default function VetoCard({
  label,
  teamName,
  mapName,
  gameName,
  variant,
  side,
  cardColors,
  highlightElement,
}: VetoCardProps) {
  const displayName = mapLabel(mapName);
  const modeTag = modeShortLabel(mapName);

  const highlight = (element: string) =>
    highlightElement === element ? "animate-pulse" : "";

  const teamTextSize =
    !teamName || teamName.length > 15
      ? "text-xl"
      : teamName.length > 9
        ? "text-2xl"
        : "text-3xl";

  const mapTextSize =
    displayName.length > 18
      ? "text-xl"
      : displayName.length > 12
        ? "text-2xl"
        : "text-3xl";

  // A ban is a map taken off the table — drain it of colour so picks read
  // louder when the two sit side by side on stream.
  const isBan = variant === "ban";

  return (
    <div className="bg-transparent flex flex-col items-center justify-end p-4">
      <AnimatePresence mode="wait">
        <motion.div
          /*
           * The card carries the brand's single angled cut on its top-right
           * corner, and a hard black poster shadow — over live gameplay that
           * offset is what separates the card from whatever is behind it.
           */
          className="kgf-cut relative w-80 aspect-3/4 shadow-[var(--shadow-hard-md)]"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION, ease: EASE }}
        >
          {/* Flame edge — the constant across every card */}
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: DURATION, ease: EASE }}
            style={{
              background: isBan
                ? "var(--kgf-burnt, #BC1A01)"
                : "var(--kgf-flame, #E94609)",
              transformOrigin: "top",
            }}
            className="absolute left-0 top-0 bottom-0 w-[4px] z-20"
          />

          {/* Team band */}
          <motion.div
            initial={{ x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.45, duration: DURATION, ease: EASE }}
            style={{
              backgroundColor: cardColors.bg[0],
              clipPath: "polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)",
              height: "56px",
            }}
            className={`absolute top-0 left-0 right-0 pl-4 pr-3 overflow-hidden ${highlight("top")}`}
          >
            <div className="flex h-full items-center justify-between gap-2">
              <span
                style={{ color: cardColors.text[0] }}
                className={`${teamTextSize} font-display font-bold uppercase tracking-[0.06em] truncate ${highlight("team")}`}
              >
                {teamName}
              </span>
              {side && side !== "DECIDER" && (
                <Image
                  src={CDN.side(gameName, side, "white")}
                  alt={side}
                  draggable={false}
                  width={30}
                  height={30}
                  priority
                  className="shrink-0"
                />
              )}
            </div>
          </motion.div>

          {/* Map image */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: DURATION, ease: EASE }}
            style={{ backgroundColor: cardColors.bg[1] }}
            className={`absolute top-[56px] bottom-[124px] left-0 right-0 overflow-hidden ${highlight("base")}`}
          >
            <Image
              src={CDN.map(gameName, slugify(displayName))}
              alt={displayName}
              draggable={false}
              priority
              fill
              sizes="320px"
              style={{
                objectFit: "cover",
                clipPath:
                  "polygon(0% 14%, 14% 0%, 100% 0%, 100% 86%, 86% 100%, 0% 100%)",
                filter: isBan ? "grayscale(0.85) brightness(0.55)" : "none",
              }}
            />
            {/* Struck through, so a ban is unmistakable at a glance */}
            {isBan && (
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: DURATION, ease: EASE }}
                style={{
                  background: "var(--kgf-burnt, #BC1A01)",
                  transformOrigin: "left",
                }}
                className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rotate-[-14deg]"
              />
            )}
          </motion.div>

          {/* Bottom block */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: DURATION, ease: EASE }}
            style={{
              backgroundColor: cardColors.bg[2],
              clipPath:
                "polygon(0 0, 100% 0, 100% 100%, 18px 100%, 0 calc(100% - 18px))",
            }}
            className={`absolute bottom-0 left-0 right-0 h-[124px] px-4 pt-3 pb-4 ${highlight("bottom")}`}
          >
            <motion.div
              className="flex h-full flex-col items-center justify-center gap-1.5"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.12, delayChildren: 0.4 },
                },
              }}
            >
              <motion.div
                variants={{
                  hidden: { y: -14, opacity: 0 },
                  visible: { y: 0, opacity: 1 },
                }}
                style={{ color: cardColors.text[1] }}
                className={`font-display text-3xl font-bold uppercase tracking-[0.16em] leading-none ${highlight("action")}`}
              >
                {label}
              </motion.div>

              {modeTag && (
                <motion.div
                  variants={{
                    hidden: { opacity: 0 },
                    visible: { opacity: 1 },
                  }}
                  style={{ color: cardColors.text[1] }}
                  className="kgf-eyebrow text-[10px] opacity-80 leading-none"
                >
                  {modeTag}
                </motion.div>
              )}

              <div
                style={{ backgroundColor: cardColors.bg[3] }}
                className={`w-40 h-[3px] ${highlight("stripe")}`}
              />

              <motion.div
                variants={{
                  hidden: { y: 14, opacity: 0 },
                  visible: { y: 0, opacity: 1 },
                }}
                style={{ color: cardColors.text[2] }}
                className={`${mapTextSize} font-display font-bold uppercase tracking-[-0.02em] text-center leading-tight ${highlight("map")}`}
              >
                {displayName}
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
