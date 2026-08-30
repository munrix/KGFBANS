// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Overlay card colours, in the Kurdistan Gaming Festival palette.
 *
 * Each card is built from four surfaces and three text colours:
 *   bg[0]  team name band      text[0]  team name
 *   bg[1]  map image backing   text[1]  action label (BAN / PICK / DECIDER)
 *   bg[2]  bottom info block   text[2]  map name
 *   bg[3]  divider rule
 *
 * The intent is that a ban reads as suppressed — cool greys, burnt-red rule,
 * muted map name — while a pick reads as claimed, carrying full flame orange.
 * The admin panel can still override any of this per event.
 */
export class CardColors {
  static readonly default = {
    ban: {
      text: ["#C7CDD3", "#EF9A6B", "#9CA6B0"],
      bg: ["#262D34", "#12161A", "#191E23", "#BC1A01"],
    },
    pick: {
      text: ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
      bg: ["#E94609", "#12161A", "#12161A", "#EF9A6B"],
    },
    pick_mode: {
      text: ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
      bg: ["#E94609", "#12161A", "#12161A", "#EF9A6B"],
    },
    decider: {
      text: ["#0D0D0F", "#FFFFFF", "#FFFFFF"],
      bg: ["#EF9A6B", "#12161A", "#12161A", "#E94609"],
    },
    ban_mode: {
      text: ["#C7CDD3", "#EF9A6B", "#9CA6B0"],
      bg: ["#262D34", "#12161A", "#191E23", "#BC1A01"],
    },
  };
}

// Default configuration
export const defaultCardColors = CardColors.default;
