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
  bo3: [
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
  ],
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
