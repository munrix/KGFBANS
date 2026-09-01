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
 * The intent is that a ban reads as suppressed — neutral greys, lava rule,
 * muted map name — while a pick reads as claimed, carrying full blaze orange.
 * The admin panel can still override any of this per event.
 *
 * Every grey here is from the KGF neutral ramp, which is derived from absolute
 * black and deliberately carries no hue. The palette has no cool tone in it, so
 * a blue-grey band would read as off-brand the moment it went to air.
 */
export class CardColors {
  static readonly default = {
    ban: {
      text: ["#CFCFCF", "#EF9A6B", "#A3A3A3"],
      bg: ["#2A2A2A", "#0D0D0D", "#1A1A1A", "#BC1A01"],
    },
    pick: {
      text: ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
      bg: ["#E94609", "#0D0D0D", "#0D0D0D", "#EF9A6B"],
    },
    pick_mode: {
      text: ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
      bg: ["#E94609", "#0D0D0D", "#0D0D0D", "#EF9A6B"],
    },
    decider: {
      text: ["#000000", "#FFFFFF", "#FFFFFF"],
      bg: ["#EF9A6B", "#0D0D0D", "#0D0D0D", "#E94609"],
    },
    ban_mode: {
      text: ["#CFCFCF", "#EF9A6B", "#A3A3A3"],
      bg: ["#2A2A2A", "#0D0D0D", "#1A1A1A", "#BC1A01"],
    },
  };
}

// Default configuration
export const defaultCardColors = CardColors.default;
