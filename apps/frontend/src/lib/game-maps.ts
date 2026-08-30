// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Call of Duty vetoes each mode from its own map pool, so the same map can
 * appear in several pools. The backend therefore identifies a CoD map by a
 * mode-qualified id ("hardpoint:Den") to keep those selections distinct.
 *
 * The tactical shooters use plain map names, so these helpers are written to
 * pass unqualified names straight through.
 */

export const MODE_LABELS: Record<string, string> = {
  hardpoint: "Hardpoint",
  snd: "Search & Destroy",
  overload: "Overload",
};

export const MODE_SHORT_LABELS: Record<string, string> = {
  hardpoint: "HP",
  snd: "S&D",
  overload: "OVL",
};

export type SplitMapId = { mode: string | null; name: string };

export const splitMapId = (id: string): SplitMapId => {
  const i = id.indexOf(":");
  if (i === -1) return { mode: null, name: id };
  return { mode: id.slice(0, i), name: id.slice(i + 1) };
};

/** The map name to show to a human ("hardpoint:Den" -> "Den"). */
export const mapLabel = (id: string) => splitMapId(id).name;

/** The mode a CoD map belongs to, or null for the tactical shooters. */
export const mapMode = (id: string) => splitMapId(id).mode;

/** Full mode name for display, or null when the id carries no mode. */
export const modeLabel = (id: string) => {
  const mode = splitMapId(id).mode;
  if (!mode) return null;
  return MODE_LABELS[mode] ?? mode;
};

/** Abbreviated mode name, for tight spaces like overlay cards. */
export const modeShortLabel = (id: string) => {
  const mode = splitMapId(id).mode;
  if (!mode) return null;
  return MODE_SHORT_LABELS[mode] ?? mode.toUpperCase();
};
