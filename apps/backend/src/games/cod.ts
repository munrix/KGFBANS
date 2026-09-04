// SPDX-FileCopyrightText: 2026 Munrix <munrix@kurdistangamingfestival.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { BaseLobby, GameType, VetoStep } from "../utils/types";
import { io } from "../utils/server";

export type GameName = "bo7";
export type GameMode = "hardpoint" | "snd" | "overload";

/**
 * A single step in the veto. Unlike the FPS games, Call of Duty draws each
 * step from a *different* map pool depending on which mode that game will be
 * played in, so every step carries the pool it applies to.
 *
 * `gameNumber` is the position in the series this step decides (G1..G7),
 * which is what the overlay labels the card with. The veto runs one mode block
 * at a time, so the steps are not in series order: a BO5 resolves G1 and G4
 * before it touches G2.
 */
export type CoDVetoStep = VetoStep & {
  pool: GameMode;
};

// CoD specific lobby interface
export interface Lobby extends BaseLobby {
  pickedMaps: Array<
    BaseLobby["pickedMaps"][number] & {
      side: string;
      sideTeamName: string;
    }
  >;
  rules: BaseLobby["rules"] & {
    gameName: GameName;
    mapNames: Array<string>; // mode-qualified ids, e.g. "hardpoint:Den"
    modePools: Record<GameMode, string[]>;
    vetoSequence: CoDVetoStep[];
  };
}

export const gameModes: GameMode[] = ["hardpoint", "snd", "overload"];

export const modeNames: Record<GameMode, string> = {
  hardpoint: "Hardpoint",
  snd: "Search & Destroy",
  overload: "Overload",
};

/**
 * What the two starting sides are called, per mode.
 *
 * Call of Duty names them mode by mode rather than once per title: Hardpoint is
 * fought between the two factions, Search and Destroy attacks and defends, and
 * Overload is symmetrical, so it only numbers the teams.
 *
 * A side is still stored as "t" or "ct" whatever the mode — every format has
 * exactly two of them, and one pair of ids keeps turn control and the overlays
 * from having to know which mode is on. Only the label read off them changes.
 */
export const modeSideNames: Record<GameMode, [string, string]> = {
  hardpoint: ["JSOC", "GUILD"],
  snd: ["Attack", "Defend"],
  overload: ["Team 1", "Team 2"],
};

/**
 * Call of Duty League 2026 (Black Ops 7) maps and modes list.
 * Overload replaced Control as the third mode this season.
 * Pools rotate mid-season, so these are defaults — the admin panel edits them.
 */
export const startMapPool: Record<GameMode, string[]> = {
  hardpoint: ["Colossus", "Den", "Gridlock", "Hacienda", "Sake", "Scar"],
  snd: ["Den", "Fringe", "Gridlock", "Hacienda", "Raid", "Sake"],
  overload: ["Den", "Exposure", "Gridlock", "Scar"],
};

// Every map that may be added to a pool from the admin panel.
const allMaps = [
  "Colossus",
  "Den",
  "Exposure",
  "Fringe",
  "Gridlock",
  "Hacienda",
  "Raid",
  "Sake",
  "Scar",
];

export const mapNamesLists: Record<GameMode, string[]> = {
  hardpoint: allMaps,
  snd: allMaps,
  overload: allMaps,
};

/** Games a single pass of the BO3 block decides. */
const bo3Games = 3;

/**
 * One BO3's worth of veto: a mode block each for Hardpoint, Search and Destroy
 * and Overload, deciding G1, G2 and G3 in that order.
 *
 * Kept apart from the table below because a BO9 is this block run three times
 * over, and the two must not be able to drift.
 */
const bo3Block: CoDVetoStep[] = [
  { pool: "hardpoint", action: "ban", actor: "A" },
  { pool: "hardpoint", action: "ban", actor: "B" },
  {
    pool: "hardpoint",
    action: "pick",
    actor: "A",
    sideActor: "B",
    gameNumber: 1,
  },
  { pool: "snd", action: "ban", actor: "B" },
  { pool: "snd", action: "ban", actor: "A" },
  { pool: "snd", action: "pick", actor: "B", sideActor: "A", gameNumber: 2 },
  { pool: "overload", action: "ban", actor: "A" },
  {
    pool: "overload",
    action: "pick",
    actor: "B",
    sideActor: "A",
    gameNumber: 3,
  },
];

/**
 * The BO3 block laid end to end `rounds` times, which is what a BO9 is.
 *
 * Each pass repeats the same bans and picks against what its pools have left,
 * and the game numbers carry on from where the last pass finished — so the
 * three passes decide G1-G3, then G4-G6, then G7-G9. Because every pass spends
 * maps out of the same three pools, a BO9 needs pools three times the size a
 * BO3 does; `requiredPoolSizes` reports that and lobby creation enforces it.
 */
const bo3Repeated = (rounds: number): CoDVetoStep[] =>
  Array.from({ length: rounds }, (_, round) =>
    bo3Block.map((step) => ({
      ...step,
      ...(step.gameNumber
        ? { gameNumber: step.gameNumber + round * bo3Games }
        : {}),
    })),
  ).flat();

/**
 * Call of Duty League veto processes, one mode block at a time.
 *
 * The A/B order restarts inside each block rather than running straight
 * through — Hardpoint opens on Team A, Search and Destroy opens on Team B — so
 * these sequences name their actor on every step instead of alternating.
 *
 * Mode order is Hardpoint / Search and Destroy / Overload, repeating, which is
 * why the game numbers within a block jump: Hardpoint decides G1 and G4.
 */
export const vetoSequences: Partial<Record<GameType, CoDVetoStep[]>> = {
  // Not a CDL format; a plain Hardpoint ban-down for one-off matches.
  bo1: [
    { pool: "hardpoint", action: "ban", actor: "A" },
    { pool: "hardpoint", action: "ban", actor: "B" },
    { pool: "hardpoint", action: "ban", actor: "A" },
    { pool: "hardpoint", action: "ban", actor: "B" },
    { pool: "hardpoint", action: "ban", actor: "A" },
    { pool: "hardpoint", action: "decider", sideActor: "B", gameNumber: 1 },
  ],
  bo3: bo3Block,
  bo5: [
    { pool: "hardpoint", action: "ban", actor: "A" },
    { pool: "hardpoint", action: "ban", actor: "B" },
    {
      pool: "hardpoint",
      action: "pick",
      actor: "A",
      sideActor: "B",
      gameNumber: 1,
    },
    {
      pool: "hardpoint",
      action: "pick",
      actor: "B",
      sideActor: "A",
      gameNumber: 4,
    },
    { pool: "snd", action: "ban", actor: "B" },
    { pool: "snd", action: "ban", actor: "A" },
    { pool: "snd", action: "pick", actor: "B", sideActor: "A", gameNumber: 2 },
    { pool: "snd", action: "pick", actor: "A", sideActor: "B", gameNumber: 5 },
    { pool: "overload", action: "ban", actor: "A" },
    { pool: "overload", action: "ban", actor: "B" },
    {
      pool: "overload",
      action: "pick",
      actor: "A",
      sideActor: "B",
      gameNumber: 3,
    },
  ],
  bo7: [
    { pool: "hardpoint", action: "ban", actor: "A" },
    { pool: "hardpoint", action: "ban", actor: "B" },
    {
      pool: "hardpoint",
      action: "pick",
      actor: "A",
      sideActor: "B",
      gameNumber: 1,
    },
    {
      pool: "hardpoint",
      action: "pick",
      actor: "B",
      sideActor: "A",
      gameNumber: 4,
    },
    { pool: "snd", action: "ban", actor: "B" },
    { pool: "snd", action: "ban", actor: "A" },
    { pool: "snd", action: "pick", actor: "B", sideActor: "A", gameNumber: 2 },
    { pool: "snd", action: "pick", actor: "A", sideActor: "B", gameNumber: 5 },
    // Game 7 is the one step where the same team both picks and takes the side.
    { pool: "snd", action: "pick", actor: "A", sideActor: "A", gameNumber: 7 },
    { pool: "overload", action: "ban", actor: "A" },
    { pool: "overload", action: "ban", actor: "B" },
    {
      pool: "overload",
      action: "pick",
      actor: "A",
      sideActor: "B",
      gameNumber: 3,
    },
    { pool: "overload", action: "decider", sideActor: "A", gameNumber: 6 },
  ],
  // A BO9 is the BO3 block run three times over, so it is generated from that
  // sequence rather than written out — see `bo3Repeated`.
  bo9: bo3Repeated(3),
};

/** Maps a format's sequence needs each mode pool to hold. */
export const requiredPoolSizes = (
  gameType: GameType,
): Record<GameMode, number> => {
  const sizes: Record<GameMode, number> = {
    hardpoint: 0,
    snd: 0,
    overload: 0,
  };
  for (const step of vetoSequences[gameType] ?? []) sizes[step.pool]++;
  return sizes;
};

/**
 * The pools with any mode too small for the format replaced by its full list.
 *
 * The rotation pools above are sized for the league's own formats. A BO9 is the
 * BO3 block run three times out of those same three pools, so it needs three
 * times the maps — more than the rotation carries. Rather than refuse a format
 * the app offers, a mode that comes up short falls back to everything the title
 * has; every format the defaults already cover is left exactly as it was.
 *
 * Only ever applied to the defaults. A pool the operator edited themselves is
 * used as they set it, and one too small for the format is an error they are
 * told about rather than something quietly rewritten under them.
 */
export const widenPools = (
  pools: Record<GameMode, string[]>,
  needed: Record<GameMode, number>,
): Record<GameMode, string[]> =>
  Object.fromEntries(
    gameModes.map((mode) => {
      const pool = pools[mode] ?? [];
      return [
        mode,
        pool.length >= needed[mode]
          ? [...pool]
          : [...(mapNamesLists[mode] ?? [])],
      ];
    }),
  ) as Record<GameMode, string[]>;

/** Build the mode-qualified map id used as the veto's unit of selection. */
export const qualify = (mode: GameMode, map: string) => `${mode}:${map}`;

/** Split a mode-qualified id back into its mode and map name. */
export const unqualify = (id: string): { mode: GameMode; map: string } => {
  const idx = id.indexOf(":");
  if (idx === -1) return { mode: "hardpoint", map: id };
  return {
    mode: id.slice(0, idx) as GameMode,
    map: id.slice(idx + 1),
  };
};

/** Flatten per-mode pools into the qualified id list a lobby vetoes over. */
export const buildMapNames = (pools: Record<GameMode, string[]>): string[] =>
  gameModes.flatMap((mode) =>
    (pools[mode] ?? []).map((map) => qualify(mode, map)),
  );

/** The pool a given veto step draws from. */
export const poolForStep = (lobby: Lobby, step: number): GameMode | undefined =>
  lobby.rules.vetoSequence[step]?.pool;

/**
 * Maps still selectable at `step` — those in the step's pool that neither
 * team has already banned or picked.
 */
export const availableAtStep = (lobby: Lobby, step: number): string[] => {
  const pool = poolForStep(lobby, step);
  if (!pool) return [];
  const used = new Set([
    ...lobby.bannedMaps.map((b) => b.map),
    ...lobby.pickedMaps.map((p) => p.map),
  ]);
  return (lobby.rules.modePools[pool] ?? [])
    .map((map) => qualify(pool, map))
    .filter((id) => !used.has(id));
};

export const startGame = (lobbyId: string, lobbies: Map<string, Lobby>) => {
  const lobby = lobbies.get(lobbyId) as Lobby;
  if (!lobby) return;

  console.log("CoD game started in lobby: " + lobbyId);
  io.to(lobbyId).emit(
    "teamNamesUpdated",
    Array.from(lobby.teamNames.entries()),
  );
  io.to(lobbyId).emit("isCoin", lobby.rules.coinFlip);
  io.to(lobbyId).emit("vetoSequence", lobby.rules.vetoSequence);

  if (lobby.rules.coinFlip && lobby.teamNames.size === 2) {
    // The CDL gives the higher seed the choice of acting as Team A or Team B;
    // without a seeding, the coin makes that call.
    const result = Math.floor(Math.random() * 2);
    io.to(lobbyId).emit("coinFlip", result);
    const names = Array.from(lobby.teamNames.values());
    lobby.teamOrder = (
      result === 1 ? [names[1], names[0]] : [names[0], names[1]]
    ) as [string, string];
  } else if (!lobby.rules.coinFlip) {
    io.to(lobbyId).emit("startWithoutCoin");
  }
};
