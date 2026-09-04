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

/**
 * What the two starting sides are called.
 *
 * Call of Duty names them per *mode* rather than once per title: Hardpoint is
 * fought between the two factions, Search & Destroy attacks and defends, and
 * Overload is symmetrical, so it only numbers the teams. The tactical shooters
 * name their sides once for the whole game.
 *
 * The veto still stores a side as "t" or "ct" whatever the mode — every format
 * has exactly two, and one pair of ids keeps the pick handler, the overlays and
 * the admin console from having to know which title is on. Only the label read
 * off them changes.
 */
export const MODE_SIDE_LABELS: Record<string, [string, string]> = {
  hardpoint: ["JSOC", "GUILD"],
  snd: ["Attack", "Defend"],
  overload: ["Team 1", "Team 2"],
};

/** Used by the tactical shooters, and by any mode without its own names. */
export const DEFAULT_SIDE_LABELS: [string, string] = ["Attack", "Defense"];

/** The pair of side names in play on a map, first "t" then "ct". */
export const sideLabelsFor = (id: string): [string, string] => {
  const mode = splitMapId(id).mode;
  return (mode && MODE_SIDE_LABELS[mode]) || DEFAULT_SIDE_LABELS;
};

/** The name of one side on a map. Empty for a decider, which has none yet. */
export const sideLabel = (id: string, side?: string) => {
  if (!side || side === "DECIDER") return "";
  const [t, ct] = sideLabelsFor(id);
  if (side === "t") return t;
  if (side === "ct") return ct;
  return side.toUpperCase();
};
