// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

import { BaseLobby, GameType, VetoStep } from "../utils/types";
import { io } from "../utils/server";

export type GameName = "r6" | "valorant";

// FPS specific lobby interface
export interface Lobby extends BaseLobby {
  pickedMaps: Array<
    BaseLobby["pickedMaps"][number] & {
      side: string;
      sideTeamName: string;
    }
  >; // Array of picked maps
  rules: BaseLobby["rules"] & {
    gameName: GameName;
    mapNames: Array<string>; // Array of this lobby mappool
    knifeDecider: boolean; // Knife decider
    mapPoolSize: number; // Map pool size
  };
}

/**
 * BO1 and BO2 are not fixed by the KGF rulebook the way BO3 and BO5 are — they
 * just ban the pool down to what the format needs. Generated from the pool size
 * so the same code covers a 4-map and a 9-map pool, alternating from Team A.
 */
const banDownTo = (poolSize: number, survivors: number): VetoStep[] => {
  const actor = (i: number) => (i % 2 === 0 ? ("A" as const) : ("B" as const));
  const bans = Math.max(poolSize - survivors, 0);
  const steps: VetoStep[] = Array.from({ length: bans }, (_, i) => ({
    action: "ban" as const,
    actor: actor(i),
  }));

  if (survivors === 1) {
    // The last map standing is the map. Whoever's turn it now is takes the side.
    steps.push({
      action: "decider",
      sideActor: actor(bans),
      gameNumber: 1,
    });
    return steps;
  }

  // BO2: both remaining maps are played, one picked by each side. The picker
  // takes their own side here — there is no "opponent's map" to trade against.
  for (let i = 0; i < survivors; i++) {
    steps.push({
      action: "pick",
      actor: actor(bans + i),
      sideActor: actor(bans + i),
      gameNumber: i + 1,
    });
  }
  return steps;
};

/**
 * KGF Rainbow Six Siege veto, section 5.6.
 *
 * Both formats consume the full nine-map pool: BO3 spends six bans on it,
 * BO5 four bans and four picks. The team that did not pick a map takes side
 * selection on it, which is what `sideActor` records.
 */
const r6Sequences: Partial<Record<GameType, VetoStep[]>> = {
  bo3: [
    { action: "ban", actor: "A" },
    { action: "ban", actor: "B" },
    { action: "ban", actor: "A" },
    { action: "ban", actor: "B" },
    { action: "pick", actor: "A", sideActor: "B", gameNumber: 1 },
    { action: "pick", actor: "B", sideActor: "A", gameNumber: 2 },
    { action: "ban", actor: "A" },
    { action: "ban", actor: "B" },
    { action: "decider", sideActor: "A", gameNumber: 3 },
  ],
  bo5: [
    { action: "ban", actor: "A" },
    { action: "ban", actor: "B" },
    { action: "pick", actor: "A", sideActor: "B", gameNumber: 1 },
    { action: "pick", actor: "B", sideActor: "A", gameNumber: 2 },
    { action: "ban", actor: "A" },
    { action: "ban", actor: "B" },
    { action: "pick", actor: "A", sideActor: "B", gameNumber: 3 },
    { action: "pick", actor: "B", sideActor: "A", gameNumber: 4 },
    { action: "decider", sideActor: "B", gameNumber: 5 },
  ],
};

/**
 * KGF Valorant veto, section 5.11. Seven maps: BO3 spends four bans, BO5 two.
 */
const valorantSequences: Partial<Record<GameType, VetoStep[]>> = {
  bo3: [
    { action: "ban", actor: "A" },
    { action: "ban", actor: "B" },
    { action: "pick", actor: "A", sideActor: "B", gameNumber: 1 },
    { action: "pick", actor: "B", sideActor: "A", gameNumber: 2 },
    { action: "ban", actor: "A" },
    { action: "ban", actor: "B" },
    { action: "decider", sideActor: "A", gameNumber: 3 },
  ],
  bo5: [
    { action: "ban", actor: "A" },
    { action: "ban", actor: "B" },
    { action: "pick", actor: "A", sideActor: "B", gameNumber: 1 },
    { action: "pick", actor: "B", sideActor: "A", gameNumber: 2 },
    { action: "pick", actor: "A", sideActor: "B", gameNumber: 3 },
    { action: "pick", actor: "B", sideActor: "A", gameNumber: 4 },
    { action: "decider", sideActor: "B", gameNumber: 5 },
  ],
};

const fixedSequences: Record<
  GameName,
  Partial<Record<GameType, VetoStep[]>>
> = {
  r6: r6Sequences,
  valorant: valorantSequences,
};

/**
 * The pool size a format's published sequence is written against. BO3 and BO5
 * name every map they touch, so the pool has to be exactly this big.
 */
export const requiredPoolSize = (
  gameName: GameName,
  gameType: GameType,
): number | null => fixedSequences[gameName]?.[gameType]?.length ?? null;

/**
 * The veto this lobby will run, or null if the game has no rules for the format.
 */
export const vetoSequenceFor = (
  gameName: GameName,
  gameType: GameType,
  poolSize: number,
): VetoStep[] | null => {
  const fixed = fixedSequences[gameName]?.[gameType];
  if (fixed) return fixed;
  if (gameType === "bo1") return banDownTo(poolSize, 1);
  if (gameType === "bo2") return banDownTo(poolSize, 2);
  return null;
};

// Complete map lists for each game
export const mapNamesLists = {
  r6: [
    "Bank",
    "Border",
    "Chalet",
    "Clubhouse",
    "Coastline",
    "Consulate",
    "Emerald Plains",
    "Fortress",
    "Kafe Dostoyevsky",
    "Kanal",
    "Lair",
    "Nighthaven Labs",
    "Oregon",
    "Outback",
    "Skyscraper",
    "Theme Park",
    "Villa",
  ],
  valorant: [
    "Abyss",
    "Ascent",
    "Bind",
    "Breeze",
    "Corrode",
    "District",
    "Drift",
    "Fracture",
    "Glitch",
    "Haven",
    "Icebox",
    "Kasbah",
    "Lotus",
    "Pearl",
    "Piazza",
    "Split",
    "Summit",
    "Sunset",
  ],
};

/**
 * The official KGF tournament pools — Rainbow Six section 5.7, Valorant 5.11.
 * The admin panel edits these; a BO3/BO5 lobby needs the pool at full size.
 */
export const startMapPool = {
  r6: [
    "Bank",
    "Border",
    "Chalet",
    "Clubhouse",
    "Consulate",
    "Kafe Dostoyevsky",
    "Lair",
    "Nighthaven Labs",
    "Fortress",
  ],
  valorant: ["Ascent", "Breeze", "Haven", "Lotus", "Split", "Summit", "Sunset"],
};

export const startGame = (lobbyId: string, lobbies: Map<string, Lobby>) => {
  const lobby = lobbies.get(lobbyId) as Lobby;
  if (lobby) {
    console.log("Game Started in lobby: " + lobbyId);
    io.to(lobbyId).emit(
      "teamNamesUpdated",
      Array.from(lobby.teamNames.entries()),
    );
    io.to(lobbyId).emit("isCoin", lobby.rules.coinFlip);

    if (lobby.rules.coinFlip && lobby.teamNames.size === 2) {
      const result =
        Math.floor(Math.random() * 2) ^
        (Date.now() % 2) ^
        (Math.random() > 0.5 ? 1 : 0);
      io.to(lobbyId).emit("coinFlip", result);
      // The coin decides who the sequence calls Team A; the caller opens the
      // veto on whichever side the first step names.
      const names = Array.from(lobby.teamNames.values());
      lobby.teamOrder = (
        result === 1 ? [names[1], names[0]] : [names[0], names[1]]
      ) as [string, string];
    } else if (!lobby.rules.coinFlip) {
      io.to(lobbyId).emit("startWithoutCoin");
    }
  }
};
