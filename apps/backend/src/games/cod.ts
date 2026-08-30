// SPDX-FileCopyrightText: 2026 Munrix <munrix@kurdistangamingfestival.com>
// SPDX-License-Identifier: AGPL-3.0-only

import { BaseLobby } from "../utils/types";
import { io } from "../utils/server";

export type GameName = "bo7";
export type GameMode = "hardpoint" | "snd" | "overload";

/**
 * A single step in the veto. Unlike the FPS games, Call of Duty draws each
 * step from a *different* map pool depending on which mode that game will be
 * played in, so every step carries the pool it applies to.
 *
 * `gameNumber` is the position in the series this step decides (G1..G5),
 * which is what the overlay labels the card with.
 */
export type VetoStep = {
  pool: GameMode;
  action: "ban" | "pick" | "decider";
  gameNumber?: number;
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
    vetoSequence: VetoStep[];
  };
}

export const gameModes: GameMode[] = ["hardpoint", "snd", "overload"];

export const modeNames: Record<GameMode, string> = {
  hardpoint: "Hardpoint",
  snd: "Search & Destroy",
  overload: "Overload",
};

/**
 * Call of Duty League 2026 (Black Ops 7) competitive map set.
 * Overload replaced Control as the third "swing" mode this season.
 * Pools rotate mid-season, so these are defaults — the admin panel edits them.
 */
export const startMapPool: Record<GameMode, string[]> = {
  hardpoint: ["Blackheart", "Colossus", "Den", "Exposure", "Scar"],
  snd: ["Colossus", "Den", "Exposure", "Raid", "Scar"],
  overload: ["Den", "Exposure", "Scar"],
};

// Every map that may be added to a pool from the admin panel.
export const mapNamesLists: Record<GameMode, string[]> = {
  hardpoint: ["Blackheart", "Colossus", "Den", "Exposure", "Raid", "Scar"],
  snd: ["Blackheart", "Colossus", "Den", "Exposure", "Raid", "Scar"],
  overload: ["Blackheart", "Colossus", "Den", "Exposure", "Raid", "Scar"],
};

/**
 * CDL series orders. A BO5 runs HP / SND / Overload / HP / SND, so the veto
 * resolves two Hardpoints, two Search & Destroys and one Overload.
 *
 * Each team bans within a pool before either picks from what is left; the
 * final mode is decided by elimination rather than a pick.
 */
export const vetoSequences: Record<string, VetoStep[]> = {
  bo1: [
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "decider", gameNumber: 1 },
  ],
  bo3: [
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "decider", gameNumber: 1 },
    { pool: "snd", action: "ban" },
    { pool: "snd", action: "ban" },
    { pool: "snd", action: "ban" },
    { pool: "snd", action: "ban" },
    { pool: "snd", action: "decider", gameNumber: 2 },
    { pool: "overload", action: "ban" },
    { pool: "overload", action: "ban" },
    { pool: "overload", action: "decider", gameNumber: 3 },
  ],
  bo5: [
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "pick", gameNumber: 1 },
    { pool: "hardpoint", action: "pick", gameNumber: 4 },
    { pool: "snd", action: "ban" },
    { pool: "snd", action: "ban" },
    { pool: "snd", action: "pick", gameNumber: 2 },
    { pool: "snd", action: "pick", gameNumber: 5 },
    { pool: "overload", action: "ban" },
    { pool: "overload", action: "ban" },
    { pool: "overload", action: "decider", gameNumber: 3 },
  ],
  bo7: [
    { pool: "hardpoint", action: "ban" },
    { pool: "hardpoint", action: "pick", gameNumber: 1 },
    { pool: "hardpoint", action: "pick", gameNumber: 4 },
    { pool: "hardpoint", action: "decider", gameNumber: 7 },
    { pool: "snd", action: "ban" },
    { pool: "snd", action: "pick", gameNumber: 2 },
    { pool: "snd", action: "pick", gameNumber: 5 },
    { pool: "snd", action: "decider", gameNumber: 6 },
    { pool: "overload", action: "ban" },
    { pool: "overload", action: "ban" },
    { pool: "overload", action: "decider", gameNumber: 3 },
  ],
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

  const firstAction = lobby.rules.mapRulesList[0];

  if (lobby.rules.coinFlip) {
    if (lobby.teamNames.size !== 2) return;

    const result = Math.floor(Math.random() * 2);
    io.to(lobbyId).emit("coinFlip", result);

    const entry = Array.from(lobby.teamNames.entries())[result] as [
      string,
      string,
    ];
    io.to(entry[0]).emit("canWorkUpdated", true);
    io.to(entry[0]).emit(firstAction === "pick" ? "canPick" : "canBan", true);
    setTimeout(() => {
      io.to(lobbyId).emit(
        "gameStateUpdated",
        firstAction === "pick"
          ? `${entry[1]} are picking a map`
          : `${entry[1]} are banning a map`,
      );
    }, 3000);
  } else {
    io.to(lobbyId).emit("startWithoutCoin");
    for (const [socketId] of lobby.teamNames.entries()) {
      io.to(socketId).emit("canWorkUpdated", true);
      io.to(socketId).emit(firstAction === "pick" ? "canPick" : "canBan", true);
    }
    io.to(lobbyId).emit(
      "gameStateUpdated",
      firstAction === "pick" ? "Pick a map" : "Ban a map",
    );
  }
};
