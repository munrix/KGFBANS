// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

import * as FPSGames from "../games/fps-games";
import * as CoD from "../games/cod";

// Game type definitions
export type GameType = "bo1" | "bo2" | "bo3" | "bo5" | "bo7" | "bo9";
export type GameName = "r6" | "valorant" | "bo7";
export type GameCategory = "fps" | "cod";
export type Roles = "member" | "observer" | "test";
export type FPSMapPool = typeof FPSGames.startMapPool;
export type CoDMapPool = typeof CoD.startMapPool;
export type MapPool = {
  fps: FPSMapPool;
  cod: CoDMapPool;
};
export type Lobby = BaseLobby | FPSGames.Lobby | CoD.Lobby;

/**
 * Which side of the veto a step belongs to.
 *
 * Every published veto sequence is written in terms of "Team A" and "Team B";
 * `teamOrder` on the lobby says which real team each one is.
 */
export type Actor = "A" | "B";

export type VetoAction = "ban" | "pick" | "decider";

/**
 * Where in the bracket this match sits.
 *
 * Purely a broadcast label — it changes nothing about the veto — but the
 * overlays lead with it, so a director can tell a semi-final from a group game
 * without reading the run sheet.
 */
export type MatchStage =
  | "group"
  | "quarterfinal"
  | "semifinal"
  | "thirdplace"
  | "final";

export const MATCH_STAGES: MatchStage[] = [
  "group",
  "quarterfinal",
  "semifinal",
  "thirdplace",
  "final",
];

export const MATCH_STAGE_LABELS: Record<MatchStage, string> = {
  group: "",
  quarterfinal: "Quarter-Final",
  semifinal: "Semi-Final",
  thirdplace: "Third Place",
  final: "Grand Final",
};

/**
 * One step of a veto.
 *
 * Turn order is read off this table rather than inferred by alternating, so a
 * format that hands the same team two moves in a row — as the Call of Duty
 * League ones do where the order restarts inside each mode's block — still
 * lands on the right side.
 */
export interface VetoStep {
  action: VetoAction;
  /** Team that bans, or that picks the map. A decider is nobody's pick. */
  actor?: Actor;
  /** Team that chooses the starting side on the map this step resolves. */
  sideActor?: Actor;
  /** Position in the series this step decides — Map 1, Map 2, and so on. */
  gameNumber?: number;
}

// Base interface for common lobby properties
export interface BaseLobby {
  lobbyId: string; // Lobby ID
  members: Set<string>; // Set of member IDs
  teamNames: Map<string, string>; // Map of team names
  /**
   * Set when the production desk named the teams itself. Such a roster is
   * fixed: it is not grown by whoever connects, and a team client dropping
   * hands its slot back to the desk instead of removing the team.
   */
  deskRoster?: boolean;
  /**
   * Which team the veto sequence calls "Team A", and which "Team B".
   *
   * Fixed at kickoff: a coin flip makes its winner Team A, otherwise the
   * roster order stands. Held by name because that is what every turn-control
   * lookup resolves on, and a team client reconnecting changes its socket id.
   */
  teamOrder?: [string, string];
  /**
   * Index into `pickedMaps` of the game currently being played, set by the
   * desk. The veto fixes the running order but cannot know when the teams move
   * on to the next map.
   */
  liveGameIndex?: number;
  observers: Set<string>; // Set of observer IDs
  gameStep: number; // Game step
  rules: {
    gameName: GameName; // Name of the game (r6, valorant, bo7)
    gameType: GameType; // Type of the game (bo1, bo2, bo3, bo5, bo7, bo9)
    mapNames: Array<string>; // Array of this lobby mappool
    vetoSequence: VetoStep[]; // The format's veto, step by step
    mapRulesList: string[]; // `vetoSequence` actions only, for the overlays
    coinFlip: boolean; // Coin flip
    admin: boolean; // Is lobby admin created
    matchStage: MatchStage; // Bracket round, for the overlays to lead with
  };
  pickedMaps: Array<{ map: string; teamName: string }>; // Array of picked maps
  bannedMaps: Array<{ map: string; teamName: string }>; // Array of banned maps
  deciderMap?: { map: string }; // Optional decider map
}
