// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The festival's competing rosters, per title.
 *
 * The desk picks from these rather than typing a name, because the crest is
 * looked up from the name: a typo is not a cosmetic problem, it is a missing
 * logo on air. Spelling here is the spelling that goes on the overlay, so it
 * matches how each team writes its own name.
 *
 * Adding a team means adding it here *and* dropping its crest into
 * `public/mapban/teams/<name with only letters and digits, lowercased>.png` —
 * see `teamSlug` in lib/cdn.ts. A name with no crest on file still works; it
 * falls back to initials.
 */
export const TEAM_ROSTER: Record<string, string[]> = {
  r6: ["GS TEAM", "Project K", "XKuRd", "ZT Esport"],
  valorant: ["GS TEAM", "team Spiders academy", "XGZ", "ZT Esport"],
  bo7: ["FuRy", "Gamers Escape", "Raven ESPORTS", "Red Zone Esports"],
};

export const rosterFor = (gameId: string): string[] =>
  TEAM_ROSTER[gameId] ?? [];

/** Whether a name is one of the entered teams, for any title. */
export const isRosteredTeam = (name: string) =>
  Object.values(TEAM_ROSTER).some((teams) =>
    teams.some((team) => team.toLowerCase() === name.trim().toLowerCase()),
  );
