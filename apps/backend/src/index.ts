// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

import { serializeForJSON } from "./utils/serialization";
import { sanitizeInput } from "./utils/input-validation";
import { defaultCardColors } from "./utils/card-colors";
import type { Serializable } from "./utils/serialization";
import { app, io } from "./utils/server";
import * as FPSGames from "./games/fps-games";
import * as CoD from "./games/cod";
import {
  Actor,
  GameName,
  MatchStage,
  MATCH_STAGES,
  GameCategory,
  GameType,
  MapPool,
  Lobby,
  Roles,
  VetoStep,
} from "./utils/types";
import { Lobby as CoDLobby, startGame as CoDStartGame } from "./games/cod";

const lobbies = new Map<string, Lobby>();
let globalCoinFlip = true;
let cardColors = defaultCardColors;

const mapPool: MapPool = {
  fps: JSON.parse(JSON.stringify(FPSGames.startMapPool)),
  cod: JSON.parse(JSON.stringify(CoD.startMapPool)),
};

export const getGameCategory = (gameName: GameName): GameCategory => {
  return gameName === "bo7" ? "cod" : "fps";
};

/**
 * CoD maps are stored mode-qualified ("hardpoint:Den"). State messages are
 * shown to humans, so render those as "Den (Hardpoint)". Plain map names from
 * the tactical shooters pass through untouched.
 */
const displayMap = (map: string) => {
  const { mode, map: name } = CoD.unqualify(map);
  return map.includes(":") ? `${name} (${CoD.modeNames[mode] ?? mode})` : name;
};

/** Clamp whatever the client sent to a stage the overlays know how to draw. */
const asMatchStage = (value: unknown): MatchStage =>
  MATCH_STAGES.includes(value as MatchStage) ? (value as MatchStage) : "group";

const sideLabel = (side: string) =>
  side === "t" ? "Attack" : side === "ct" ? "Defense" : side.toUpperCase();

/**
 * The socket that owns a team.
 *
 * Turn control has to follow the *team*, not whoever emitted the event, so an
 * admin can act on either side's behalf without stranding that team's board.
 */
const socketForTeam = (lobby: Lobby, teamName: string) => {
  for (const [socketId, name] of lobby.teamNames.entries()) {
    if (name === teamName) return socketId;
  }
  return "";
};

/**
 * The stand-in id a desk-named team is held under while no client owns it.
 *
 * It is not a real socket id, so emitting to it is a harmless no-op and a
 * disconnect can never sweep it away. Derived from the name, which the two
 * teams are required to differ on, so the same slot is always addressable.
 */
const deskSlot = (lobbyId: string, teamName: string) =>
  `desk:${lobbyId}:${teamName}`;

/**
 * Which real teams the sequences' "Team A" and "Team B" stand for.
 *
 * Fixed at kickoff — a coin flip makes its winner Team A — and otherwise the
 * order the desk entered the two teams in. Held by name, because that is what
 * every turn-control lookup resolves on and a reconnecting client changes its
 * socket id.
 */
const teamOrder = (lobby: Lobby): [string, string] => {
  const names = Array.from(lobby.teamNames.values());
  const fixed = lobby.teamOrder;
  if (fixed && names.includes(fixed[0]) && names.includes(fixed[1])) {
    return fixed;
  }
  return [names[0] ?? "", names[1] ?? ""];
};

/** The team a step's `actor` or `sideActor` resolves to. */
const teamForActor = (lobby: Lobby, actor?: Actor) =>
  actor ? teamOrder(lobby)[actor === "A" ? 0 : 1] : "";

const stepAt = (lobby: Lobby, index: number): VetoStep | undefined =>
  lobby.rules.vetoSequence?.[index];

/** The team the sequence has banning or picking at the current step. */
const actingTeam = (lobby: Lobby) =>
  teamForActor(lobby, stepAt(lobby, lobby.gameStep)?.actor);

/** The team that chooses the starting side on the current step's map. */
const sideTeam = (lobby: Lobby) =>
  teamForActor(lobby, stepAt(lobby, lobby.gameStep)?.sideActor);

/**
 * Maps still on the table for the current step.
 *
 * Call of Duty scopes this to the mode the step draws from, so a decider only
 * ever resolves within its own pool.
 */
const remainingMaps = (lobby: Lobby): string[] => {
  if (getGameCategory(lobby.rules.gameName) === "cod") {
    return CoD.availableAtStep(lobby as CoDLobby, lobby.gameStep);
  }
  const used = new Set([
    ...lobby.pickedMaps.map((p) => p.map),
    ...lobby.bannedMaps.map((b) => b.map),
  ]);
  return lobby.rules.mapNames.filter((m) => !used.has(m));
};

/** True while the veto still has steps left to play. */
const vetoInProgress = (lobby: Lobby) =>
  lobby.gameStep < lobby.rules.mapRulesList.length;

/**
 * Hand the controls to whoever the sequence says moves next.
 *
 * Turn order is read off the format's table rather than by alternating sides.
 * The Call of Duty formats restart the A/B order inside each mode's block —
 * Hardpoint opens on Team A, Search and Destroy on Team B — so "the other
 * team" is not always the right answer, and a BO7 gives Team A both the Game 7
 * pick and its side.
 */
const advanceTurn = (lobby: Lobby) => {
  const lobbyId = lobby.lobbyId;

  // Everyone puts their board down; the step's actor picks it back up.
  for (const socketId of lobby.teamNames.keys()) {
    io.to(socketId).emit("canWorkUpdated", false);
    io.to(socketId).emit("canBan", false);
    io.to(socketId).emit("canPick", false);
  }

  if (!vetoInProgress(lobby)) {
    io.to(lobbyId).emit("canWorkUpdated", false);
    return;
  }

  const action =
    stepAt(lobby, lobby.gameStep)?.action ??
    lobby.rules.mapRulesList[lobby.gameStep];

  // A knife decider takes what its pool has left and settles the side in game,
  // so there is nothing for either team to do here.
  if (action === "decider" && (lobby as FPSGames.Lobby).rules.knifeDecider) {
    const notPickedMap = remainingMaps(lobby)[0] ?? "";
    (lobby as FPSGames.Lobby).pickedMaps.push({
      map: notPickedMap,
      teamName: "",
      side: "DECIDER",
      sideTeamName: "",
    });
    lobby.gameStep++;
    io.to(lobbyId).emit("pickedUpdated", lobby.pickedMaps);
    io.to(lobbyId).emit(
      "gameStateUpdated",
      "Decider - " + displayMap(notPickedMap),
    );
    advanceTurn(lobby);
    return;
  }

  // An ordinary decider leaves only the side to settle, and the sequence says
  // who settles it; every other step names the team that bans or picks.
  const team = action === "decider" ? sideTeam(lobby) : actingTeam(lobby);
  const socketId = socketForTeam(lobby, team);
  io.to(socketId).emit("canWorkUpdated", true);
  io.to(socketId).emit(action === "ban" ? "canBan" : "canPick", true);
  io.to(lobbyId).emit(
    "gameStateUpdated",
    action === "ban"
      ? `${team} are banning a map`
      : action === "decider"
        ? `${team} are choosing the side on the decider`
        : `${team} are picking a map`,
  );
};

/**
 * Everything the admin console needs to drive a veto by hand: who is playing,
 * what is still selectable, and which action the next step expects.
 */
const adminLobbyState = (lobby: Lobby) => ({
  lobbyId: lobby.lobbyId,
  gameName: lobby.rules.gameName,
  gameType: lobby.rules.gameType,
  matchStage: lobby.rules.matchStage,
  category: getGameCategory(lobby.rules.gameName),
  teamNames: Array.from(lobby.teamNames.values()),
  liveGameIndex: lobby.liveGameIndex ?? 0,
  mapNames: lobby.rules.mapNames,
  mapRulesList: lobby.rules.mapRulesList,
  gameStep: lobby.gameStep,
  currentAction: lobby.rules.mapRulesList[lobby.gameStep] ?? null,
  // Who the sequence has acting, so the desk follows the rulebook rather than
  // whichever team the operator last clicked.
  actingTeam: actingTeam(lobby),
  sideTeam: sideTeam(lobby),
  available: remainingMaps(lobby),
  bannedMaps: lobby.bannedMaps,
  pickedMaps: lobby.pickedMaps,
  finished: !vetoInProgress(lobby),
  vetoSequence:
    getGameCategory(lobby.rules.gameName) === "cod"
      ? (lobby as CoDLobby).rules.vetoSequence
      : null,
});

/**
 * The lobby that unpinned overlays mirror.
 *
 * An overlay opened as plain `/obs` has no match of its own, so it follows
 * whichever one the desk currently has open. An overlay opened as
 * `/obs?lobby=1234` ignores this and stays on its own match.
 */
let obsLobbyId: string | null = null;

/**
 * Point unpinned overlays at a lobby.
 *
 * Switching matches makes the overlay fade out and rebuild itself, which would
 * blank the source mid-veto if it fired on every action — so an unchanged
 * target is skipped unless the operator explicitly asked for a resync.
 */
const pointObsAt = (lobbyId: string, { force = false } = {}) => {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  if (obsLobbyId === lobbyId && !force) return;

  obsLobbyId = lobbyId;
  console.log(`Overlays now following lobby ${lobbyId}`);
  io.to("obs_views").emit("admin.setObsLobby", lobbyId);
  io.to("obs_views").emit("matchStage", lobby.rules.matchStage);
  io.to("obs_views").emit(
    "teamNamesUpdated",
    Array.from(lobby.teamNames.entries()),
  );
  io.to("obs_views").emit("bannedUpdated", lobby.bannedMaps);
  io.to("obs_views").emit("pickedUpdated", lobby.pickedMaps);
  if (getGameCategory(lobby.rules.gameName) === "cod") {
    io.to("obs_views").emit(
      "vetoSequence",
      (lobby as CoDLobby).rules.vetoSequence,
    );
  }
};

/** Push fresh state to any admin console watching this lobby. */
const broadcastAdminState = (lobbyId: string) => {
  const lobby = lobbies.get(lobbyId);
  if (lobby) {
    io.to(`admin:${lobbyId}`).emit("admin.lobbyState", adminLobbyState(lobby));
  }
};

app.get("/api/cardColors", (_req, res) => {
  res.json(cardColors);
});

app.get("/api/lobbies", (_req, res) => {
  res.json(
    serializeForJSON(Array.from(lobbies.values()) as unknown as Serializable),
  );
});

app.get("/api/mapPool", (_req, res) => {
  res.json({
    mapPool: { fps: mapPool.fps, cod: mapPool.cod },
    mapNamesLists: { fps: FPSGames.mapNamesLists, cod: CoD.mapNamesLists },
  });
});

app.get("/api/coinFlip", (_req, res) => {
  res.json({ coinFlip: globalCoinFlip });
});

app.get("/api/runtime-env", (_req, res) => {
  res.json({
    NEXT_PUBLIC_CDN_BASE: process.env.NEXT_PUBLIC_CDN_BASE ?? "",
    NEXT_PUBLIC_CDN_LOGO:
      process.env.NEXT_PUBLIC_CDN_LOGO ?? "brand/kgf-wordmark-white.png",
  });
});

const startGame = (lobbyId: string) => {
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;

  // Kickoff announces the roster and settles which team the sequence will
  // call Team A; the sequence itself then says whose board lights up.
  if (getGameCategory(lobby.rules.gameName) === "cod") {
    CoDStartGame(lobbyId, lobbies as Map<string, CoDLobby>);
  } else {
    FPSGames.startGame(lobbyId, lobbies as Map<string, FPSGames.Lobby>);
  }

  // The coin gets its animation before the first board opens.
  if (lobby.rules.coinFlip) {
    setTimeout(() => {
      advanceTurn(lobby);
      broadcastAdminState(lobbyId);
    }, 3000);
  } else {
    advanceTurn(lobby);
    broadcastAdminState(lobbyId);
  }
};

io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  socket.data.lobbies = new Set<string>();

  socket.on("joinLobby", (lobbyId: string, role: Roles = "member") => {
    socket.join(lobbyId);

    // Handle test case
    if (role === "test") {
      io.to(socket.id).emit(
        lobbies.get(lobbyId) ? "lobbyExists" : "lobbyUndefined",
        lobbyId,
      );
      return;
    }

    console.log(
      `User ${socket.id} ${role === "observer" ? "observing" : "joined"} lobby ${lobbyId}`,
    );

    // Check if the lobby exists
    if (!lobbies.has(lobbyId)) {
      io.to(socket.id).emit("lobbyUndefined", lobbyId);
      return;
    }
    const lobby = lobbies.get(lobbyId)!;

    if (getGameCategory(lobby.rules.gameName) === "cod") {
      const codLobby = lobby as CoDLobby;
      io.to(socket.id).emit("codLobbySettings", {
        gameType: codLobby.rules.gameType,
        modePools: codLobby.rules.modePools,
      });
      io.to(socket.id).emit("vetoSequence", codLobby.rules.vetoSequence);
    }
    if (getGameCategory(lobby.rules.gameName) === "fps") {
      const fpsLobby = lobby as FPSGames.Lobby;
      io.to(socket.id).emit("fpsLobbySettings", {
        gameType: fpsLobby.rules.gameType,
        mapPoolSize: fpsLobby.rules.mapPoolSize,
        knifeDecider: fpsLobby.rules.knifeDecider,
      });
    }
    io.to(lobbyId).emit("mapNames", lobby.rules.mapNames);
    io.to(lobbyId).emit("gameName", lobby.rules.gameName);
    io.to(socket.id).emit("matchStage", lobby.rules.matchStage);

    // Add the socket ID to the appropriate list based on role
    if (role === "observer") {
      lobby.observers.add(socket.id);
    } else if (role === "member") {
      lobby.members.add(socket.id);
    }

    // Add the lobbyId to the socket's list of lobbies
    socket.data.lobbies.add(lobbyId);
    // Observers need the roster too — the in-game strip puts both team names
    // on air, and without this it would only ever show its placeholders.
    io.to(socket.id).emit(
      "teamNamesUpdated",
      Array.from(lobby.teamNames.entries()),
    );
    if (lobby.pickedMaps.length > 0) {
      io.to(socket.id).emit("pickedUpdated", lobby.pickedMaps);
    }
    if (lobby.bannedMaps.length > 0) {
      io.to(socket.id).emit("bannedUpdated", lobby.bannedMaps);
    }
    // The strip needs to know which game is on air the moment it binds.
    io.to(socket.id).emit("liveGameUpdated", lobby.liveGameIndex ?? 0);
  });

  socket.on(
    "createFPSLobby",
    (data: {
      lobbyId: string;
      gameName: FPSGames.GameName;
      gameType: GameType;
      knifeDecider: boolean;
      mapPoolSize: number;
      customMapPool: Record<string, string[]> | null;
      coinFlip: boolean | null;
      admin: boolean | null;
      matchStage: MatchStage | null;
    }) => {
      const {
        lobbyId,
        gameName,
        gameType,
        knifeDecider,
        mapPoolSize,
        customMapPool,
        coinFlip,
        admin,
      } = data;
      const stage = asMatchStage(data.matchStage);
      console.log("Lobby created with id " + lobbyId);

      const sourceMapPool =
        (customMapPool ? customMapPool[gameName] : mapPool["fps"][gameName]) ??
        [];

      // BO3 and BO5 follow the published KGF sequences, which name every map
      // they touch — the pool has to be exactly the size those expect.
      const required = FPSGames.requiredPoolSize(gameName, gameType);
      if (required && sourceMapPool.length < required) {
        io.to(socket.id).emit(
          "lobbyCreationError",
          `${gameName.toUpperCase()} ${gameType.toUpperCase()} requires a ${required}-map pool`,
        );
        return;
      }

      const selectedMapPool = sourceMapPool.slice(
        0,
        required ?? Math.min(mapPoolSize, sourceMapPool.length),
      );

      // bo7 is a Call of Duty format only — the FPS games have no rules for it.
      const vetoSequence = FPSGames.vetoSequenceFor(
        gameName,
        gameType,
        selectedMapPool.length,
      );
      if (!vetoSequence) {
        io.to(socket.id).emit(
          "lobbyCreationError",
          `${gameName} does not support ${gameType.toUpperCase()}`,
        );
        return;
      }

      let lobby = lobbies.get(lobbyId) as FPSGames.Lobby;
      if (!lobby) {
        // Create a new lobby
        lobby = {
          lobbyId,
          members: new Set<string>(),
          teamNames: new Map<string, string>(),
          observers: new Set<string>(),
          pickedMaps: [],
          bannedMaps: [],
          rules: {
            gameName: gameName,
            gameType: gameType,
            mapNames: selectedMapPool,
            vetoSequence: vetoSequence,
            mapRulesList: vetoSequence.map((step) => step.action),
            coinFlip: coinFlip ?? globalCoinFlip,
            admin: admin ?? false,
            matchStage: stage,
            knifeDecider: knifeDecider,
            mapPoolSize: selectedMapPool.length,
          },
          gameStep: 0,
        };

        lobbies.set(lobbyId, lobby);
        io.to(socket.id).emit("lobbyCreated", lobbyId);
        io.emit("lobbiesUpdated");
      }
    },
  );

  socket.on(
    "createCoDLobby",
    (data: {
      lobbyId: string;
      gameType: GameType;
      customMapPool: Record<string, string[]> | null;
      coinFlip: boolean | null;
      admin: boolean | null;
      matchStage: MatchStage | null;
    }) => {
      const { lobbyId, gameType, customMapPool, coinFlip, admin } = data;
      const stage = asMatchStage(data.matchStage);
      console.log("CoD lobby created with id " + lobbyId);

      const vetoSequence = CoD.vetoSequences[gameType];
      if (!vetoSequence) {
        io.to(socket.id).emit(
          "lobbyCreationError",
          `Black Ops 7 does not support ${gameType.toUpperCase()}`,
        );
        return;
      }

      let lobby = lobbies.get(lobbyId) as CoDLobby;
      if (!lobby) {
        const modePools = (customMapPool ?? mapPool.cod) as Record<
          CoD.GameMode,
          string[]
        >;

        // Each mode's block bans and picks a fixed number of maps out of its
        // own pool, so a pool trimmed too far would strand the veto mid-mode.
        const needed = CoD.requiredPoolSizes(gameType);
        const short = CoD.gameModes.find(
          (mode) => (modePools[mode]?.length ?? 0) < needed[mode],
        );
        if (short) {
          io.to(socket.id).emit(
            "lobbyCreationError",
            `${CoD.modeNames[short]} needs at least ${needed[short]} maps for ${gameType.toUpperCase()}`,
          );
          return;
        }

        // Maps are stored mode-qualified ("hardpoint:Den") so that the same
        // map banned in one mode stays available in another.
        lobby = {
          lobbyId,
          members: new Set<string>(),
          teamNames: new Map<string, string>(),
          observers: new Set<string>(),
          pickedMaps: [],
          bannedMaps: [],
          gameStep: 0,
          rules: {
            gameName: "bo7",
            gameType: gameType,
            modePools,
            mapNames: CoD.buildMapNames(modePools),
            vetoSequence,
            mapRulesList: vetoSequence.map((step) => step.action),
            coinFlip: coinFlip ?? globalCoinFlip,
            admin: admin ?? false,
            matchStage: stage,
          },
        } as CoDLobby;

        lobbies.set(lobbyId, lobby);
        io.to(socket.id).emit("lobbyCreated", lobbyId);
        io.emit("lobbiesUpdated");
      }
    },
  );

  socket.on("admin.editFPSMapPool", (newMapPool?: Record<string, string[]>) => {
    mapPool.fps = (newMapPool as typeof mapPool.fps) || FPSGames.startMapPool;
  });

  /**
   * Admin override.
   *
   * Watching a lobby puts this socket in a per-lobby admin room so it receives
   * state after every action. The admin then drives the veto with the ordinary
   * `lobby.ban` / `lobby.pick` events, naming whichever team it is acting for —
   * turn control resolves by team, so both sides' boards stay in sync.
   */
  socket.on("admin.watchLobby", (lobbyId: string) => {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) {
      io.to(socket.id).emit("lobbyNotFound");
      return;
    }
    socket.join(`admin:${lobbyId}`);
    socket.join(lobbyId);
    socket.data.lobbies.add(lobbyId);
    io.to(socket.id).emit("admin.lobbyState", adminLobbyState(lobby));

    // Opening a lobby's console is the desk saying "this is the match on air",
    // so overlays follow it from here without anyone pushing it to them.
    pointObsAt(lobbyId);
  });

  socket.on("admin.unwatchLobby", (lobbyId: string) => {
    socket.leave(`admin:${lobbyId}`);
  });

  socket.on("admin.coinFlipUpdate", (coinFlip: boolean) => {
    globalCoinFlip = coinFlip;
    console.log("Coin Flip globally updated to " + coinFlip);
    io.emit("coinFlipUpdated", coinFlip);
  });

  socket.on("obs.getPatternList", (lobbyId: string) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      io.to(socket.id).emit("patternList", lobby.rules.mapRulesList);
    }
  });

  socket.on("lobby.teamName", (data: { lobbyId: string; teamName: string }) => {
    const { lobbyId } = data;
    const teamName = sanitizeInput(data.teamName);
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      /**
       * The desk owns the roster of a lobby it named, so a team arriving with
       * the lobby code takes over its existing slot rather than being added
       * alongside it. A third entry would break every "the other team" lookup
       * — turn control and BO3/BO5 map attribution both use one — and a stray
       * viewer typing a name should not be able to do that mid-broadcast.
       */
      if (lobby.deskRoster) {
        if (!socketForTeam(lobby, teamName)) {
          console.log(
            `Ignoring "${teamName}" in desk-run lobby ${lobbyId}: not on the roster`,
          );
          io.to(socket.id).emit(
            "teamNamesUpdated",
            Array.from(lobby.teamNames.entries()),
          );
          return;
        }
        // Rebuilt rather than deleted and re-added, so the two teams keep the
        // slot order the desk set them up in.
        lobby.teamNames = new Map(
          Array.from(lobby.teamNames.entries()).map(([id, name]) =>
            name === teamName ? [socket.id, name] : [id, name],
          ),
        );
      } else {
        lobby.teamNames.set(socket.id, teamName);
      }
      console.log(`Team ${teamName} joined lobby ${lobbyId}`);
      console.log(
        `Current teams: ${Array.from(lobby.teamNames.entries())
          .map(([id, name]) => `${id}:${name}`)
          .join(", ")}`,
      );

      io.to(lobbyId).emit(
        "teamNamesUpdated",
        Array.from(lobby.teamNames.entries()),
      );

      // Start the game if we have 2 teams and admin mode is off
      if (!lobby.rules.admin && lobby.teamNames.size === 2) {
        console.log(`Auto-starting game for lobby ${lobbyId} with 2 teams`);
        startGame(lobbyId);
      }
    }
  });

  /**
   * Name both teams from the production desk.
   *
   * Team names normally arrive from the team clients themselves and are keyed
   * by the socket that sent them. When the desk runs the veto there are no
   * team clients to key on, so the names go in under synthetic ids that no
   * socket owns: emitting to one is a harmless no-op, and a disconnect can
   * never delete them the way it would a real member's entry.
   *
   * The two names have to differ — turn control and BO3/BO5 map attribution
   * both resolve "the other team" by name, so a duplicate would strand a side.
   */
  socket.on(
    "admin.setTeamNames",
    (data: { lobbyId: string; teamNames: [string, string] }) => {
      const { lobbyId } = data;
      const lobby = lobbies.get(lobbyId);
      if (!lobby) {
        io.to(socket.id).emit("lobbyNotFound");
        return;
      }

      const [first, second] = (data.teamNames ?? []).map((name) =>
        sanitizeInput(name ?? ""),
      );
      const names: [string, string] = [first || "Team A", second || "Team B"];

      if (names[0] === names[1]) {
        io.to(socket.id).emit(
          "admin.teamNamesError",
          "The two teams need different names",
        );
        return;
      }

      lobby.teamNames = new Map(
        names.map((name) => [deskSlot(lobbyId, name), name]),
      );
      lobby.deskRoster = true;
      console.log(
        `Desk named teams in lobby ${lobbyId}: ${names.join(" vs ")}`,
      );

      io.to(lobbyId).emit(
        "teamNamesUpdated",
        Array.from(lobby.teamNames.entries()),
      );
      io.to(socket.id).emit("admin.teamNamesSet", names);
      broadcastAdminState(lobbyId);
    },
  );

  /**
   * Which game of the series is on air.
   *
   * The veto decides the running order; it cannot know when the teams actually
   * move from map one to map two. The desk calls that, and the in-game strip
   * reads it to mark "now playing" and everything after it as "next".
   *
   * Held as an index into the picked maps, so it survives a reordering of the
   * series and means nothing until at least one map has been picked.
   */
  socket.on("admin.setLiveGame", (data: { lobbyId: string; index: number }) => {
    const lobby = lobbies.get(data.lobbyId);
    if (!lobby) {
      io.to(socket.id).emit("lobbyNotFound");
      return;
    }
    const index = Number(data.index);
    if (!Number.isInteger(index) || index < 0) return;

    lobby.liveGameIndex = index;
    console.log(`Lobby ${data.lobbyId} is now playing game ${index + 1}`);
    io.to(data.lobbyId).emit("liveGameUpdated", index);
    io.to("obs_views").emit("liveGameUpdated", index);
    broadcastAdminState(data.lobbyId);
  });

  socket.on("obs.getLiveGame", (lobbyId: string) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      io.to(socket.id).emit("liveGameUpdated", lobby.liveGameIndex ?? 0);
    }
  });

  socket.on("admin.start", (lobbyId: string) => {
    startGame(lobbyId);
  });

  socket.on("getLobbyGameCategory", (lobbyId: string) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      // Get the game type from the lobby rules
      const gameType = lobby.rules.gameName;
      io.to(socket.id).emit("lobbyGameCategory", getGameCategory(gameType));
    } else {
      io.to(socket.id).emit("lobbyNotFound");
    }
  });

  socket.on(
    "lobby.startPick",
    (data: { lobbyId: string; teamName: string; selectedMapIndex: number }) => {
      const { lobbyId, teamName, selectedMapIndex } = data;
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;

      // The sequence names who takes the side on this map: normally the team
      // that did not pick it, but a BO1 picker takes their own, and Game 7 of
      // a CDL BO7 leaves it with the picker too.
      const chooser = sideTeam(lobby) || teamName;
      const chooserSocket = socketForTeam(lobby, chooser);

      for (const socketId of lobby.teamNames.keys()) {
        if (socketId === chooserSocket) continue;
        io.to(socketId).emit("canWorkUpdated", false);
        io.to(socketId).emit("canPick", false);
      }
      io.to(chooserSocket).emit("backend.startPick", selectedMapIndex);
    },
  );
  socket.on(
    "lobby.pick",
    (data: {
      lobbyId: string;
      map: string;
      teamName: string;
      side: string;
    }) => {
      const { lobbyId, map, teamName, side = "" } = data;
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;

      const action =
        stepAt(lobby, lobby.gameStep)?.action ??
        lobby.rules.mapRulesList[lobby.gameStep];
      const isDecider = action === "decider";

      // This event is emitted by whoever chose the *side*. The map itself is
      // credited to the team the sequence had pick it — to nobody on a
      // decider, which is only ever what its pool had left over.
      const sideTeamName = teamName || sideTeam(lobby);
      const mapTeamName = isDecider ? "" : actingTeam(lobby) || teamName;

      (lobby as FPSGames.Lobby).pickedMaps.push({
        map,
        teamName: mapTeamName,
        side,
        sideTeamName,
      });
      lobby.gameStep++;

      io.to(lobbyId).emit("endPick");
      io.to(lobbyId).emit(
        "gameStateUpdated",
        isDecider
          ? `Decider - ${displayMap(map)}, ${sideTeamName} chose ${sideLabel(side)}`
          : `${mapTeamName} picked ${displayMap(map)}, ${sideTeamName} chose ${sideLabel(side)}`,
      );
      console.log("Picked entries updated:", lobby.pickedMaps);
      io.to(lobbyId).emit("pickedUpdated", lobby.pickedMaps);

      advanceTurn(lobby);
      broadcastAdminState(lobbyId);
    },
  );
  socket.on("lobby.decider", (data: { lobbyId: string; map: string }) => {
    const { lobbyId, map } = data;
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      // Set the decider map
      lobby.deciderMap = { map };

      console.log("Sending decider map to all clients:", map);
      // Update the game state
      io.to(lobbyId).emit("gameStateUpdated", `Decider - ${displayMap(map)}`);
      io.to(lobbyId).emit("deciderUpdated", { map });

      // Move to next game step
      lobby.gameStep++;
      broadcastAdminState(lobbyId);
    }
  });
  socket.on(
    "lobby.ban",
    (data: { lobbyId: string; map: string; teamName: string }) => {
      const { lobbyId, map, teamName } = data;
      const lobby = lobbies.get(lobbyId);
      if (!lobby) return;

      // Credited to the team the sequence has banning, so an admin proxying
      // for a side cannot mis-attribute the ban by having the wrong team
      // selected on the console.
      lobby.bannedMaps.push({ map, teamName: actingTeam(lobby) || teamName });
      lobby.gameStep++;

      // Emit bannedUpdated to all clients, including observers
      io.to(lobbyId).emit("bannedUpdated", lobby.bannedMaps);

      advanceTurn(lobby);
      broadcastAdminState(lobbyId);
    },
  );
  socket.on("admin.delete", (lobbyId: string) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      // Notify all members that the lobby is being deleted
      io.to(lobbyId).emit("lobbyDeleted", lobbyId);

      // Remove all members from the lobby
      lobby.members.forEach((memberId) => {
        const memberSocket = io.sockets.sockets.get(memberId);
        if (memberSocket) {
          memberSocket.leave(lobbyId);
          memberSocket.data.lobbies.delete(lobbyId);
        }
      });

      // Delete the lobby from the lobbies Map
      lobbies.delete(lobbyId);
      if (obsLobbyId === lobbyId) {
        obsLobbyId = null;
      }

      console.log(`Lobby ${lobbyId} has been deleted`);
      io.emit("lobbiesUpdated");
    }
  });

  socket.on("admin.clear_obs", (lobbyId: string) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.observers.forEach((observer) => {
        io.to(observer).emit("backend.clear_obs");
      });
    }
  });

  socket.on("admin.play_obs", (lobbyId: string) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      lobby.observers.forEach((observer) => {
        io.to(observer).emit("bannedUpdated", lobby.bannedMaps);
        io.to(observer).emit("pickedUpdated", lobby.pickedMaps);
        if (getGameCategory(lobby.rules.gameName) === "cod") {
          io.to(observer).emit(
            "vetoSequence",
            (lobby as CoDLobby).rules.vetoSequence,
          );
        }
      });
    }
  });

  socket.on("admin.editCardColors", (newCardColors?) => {
    cardColors = newCardColors || defaultCardColors;
    console.log("Card colors updated:", cardColors);
    io.emit("cardColorsUpdated", cardColors);
  });

  // Track OBS views

  socket.on("joinObsView", () => {
    console.log("OBS view joined:", socket.id);
    socket.join("obs_views");

    // An overlay that comes up after the desk already opened a match — OBS
    // starting late, or reloading a scene — catches up instead of sitting
    // blank until someone pushes the lobby to it.
    if (obsLobbyId && lobbies.has(obsLobbyId)) {
      io.to(socket.id).emit("admin.setObsLobby", obsLobbyId);
    }
  });

  // Manual override, for pointing overlays at a match the desk does not
  // currently have open. The everyday path needs no push at all.
  socket.on("admin.setObsLobby", (lobbyId: string) => {
    pointObsAt(lobbyId, { force: true });
  });

  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);

    // Remove the socket ID from all lobbies it was in
    for (const lobbyId of socket.data.lobbies) {
      const lobby = lobbies.get(lobbyId);
      if (lobby !== undefined) {
        lobby.members.delete(socket.id);

        const heldTeam = lobby.teamNames.get(socket.id);
        if (lobby.deskRoster && heldTeam !== undefined) {
          // A team the desk set up does not vanish because its client dropped
          // — the slot goes back to the desk, which can keep banning for them.
          lobby.teamNames = new Map(
            Array.from(lobby.teamNames.entries()).map(([id, name]) =>
              id === socket.id ? [deskSlot(lobbyId, name), name] : [id, name],
            ),
          );
        } else {
          lobby.teamNames.delete(socket.id);
        }
        console.log(`User ${socket.id} left lobby ${lobbyId}`);

        // Broadcast the updated team names to all lobby members
        io.to(lobbyId).emit(
          "teamNamesUpdated",
          Array.from(lobby.teamNames.entries()),
        );

        // Only delete non-admin lobbies when they're empty
        if (lobby.members.size === 0 && !lobby.rules.admin) {
          lobbies.delete(lobbyId);
          console.log(`Lobby ${lobbyId} deleted as it has no more members`);
          io.emit("lobbiesUpdated");
        } else {
          // Broadcast the updated team names to all lobby members
          io.to(lobbyId).emit(
            "teamNamesUpdated",
            Array.from(lobby.teamNames.entries()),
          );
        }
      }
    }
  });
});
