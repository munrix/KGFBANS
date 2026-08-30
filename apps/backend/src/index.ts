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
  GameName,
  GameCategory,
  GameType,
  MapPool,
  Lobby,
  Roles,
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

/** The opposing team's socket id and name, relative to `teamName`. */
const otherTeam = (lobby: Lobby, teamName: string) => {
  for (const [socketId, name] of lobby.teamNames.entries()) {
    if (name !== teamName) return { socketId, name };
  }
  return { socketId: "", name: "" };
};

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
 * Everything the admin console needs to drive a veto by hand: who is playing,
 * what is still selectable, and which action the next step expects.
 */
const adminLobbyState = (lobby: Lobby) => ({
  lobbyId: lobby.lobbyId,
  gameName: lobby.rules.gameName,
  gameType: lobby.rules.gameType,
  category: getGameCategory(lobby.rules.gameName),
  teamNames: Array.from(lobby.teamNames.values()),
  mapNames: lobby.rules.mapNames,
  mapRulesList: lobby.rules.mapRulesList,
  gameStep: lobby.gameStep,
  currentAction: lobby.rules.mapRulesList[lobby.gameStep] ?? null,
  available: remainingMaps(lobby),
  bannedMaps: lobby.bannedMaps,
  pickedMaps: lobby.pickedMaps,
  finished: !vetoInProgress(lobby),
  vetoSequence:
    getGameCategory(lobby.rules.gameName) === "cod"
      ? (lobby as CoDLobby).rules.vetoSequence
      : null,
});

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
  if (lobby) {
    if (getGameCategory(lobby.rules.gameName) === "cod") {
      CoDStartGame(lobbyId, lobbies as Map<string, CoDLobby>);
    } else {
      FPSGames.startGame(lobbyId, lobbies as Map<string, FPSGames.Lobby>);
    }
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

    // Add the socket ID to the appropriate list based on role
    if (role === "observer") {
      lobby.observers.add(socket.id);
    } else if (role === "member") {
      lobby.members.add(socket.id);
    }

    // Add the lobbyId to the socket's list of lobbies
    socket.data.lobbies.add(lobbyId);
    if (role === "member") {
      io.to(socket.id).emit(
        "teamNamesUpdated",
        Array.from(lobby.teamNames.entries()),
      );
    }
    if (lobby.pickedMaps.length > 0) {
      io.to(socket.id).emit("pickedUpdated", lobby.pickedMaps);
    }
    if (lobby.bannedMaps.length > 0) {
      io.to(socket.id).emit("bannedUpdated", lobby.bannedMaps);
    }
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
      console.log("Lobby created with id " + lobbyId);

      // Rule validation
      if ((gameType === "bo3" || gameType === "bo5") && mapPoolSize !== 7) {
        io.to(socket.id).emit(
          "lobbyCreationError",
          "BO3/BO5 requires a 7-map pool",
        );
        return;
      }

      // bo7 is a Call of Duty format only — the FPS games have no rules for it.
      const mapRulesList =
        FPSGames.mapRulesLists[gameType as keyof typeof FPSGames.mapRulesLists];
      if (!mapRulesList) {
        io.to(socket.id).emit(
          "lobbyCreationError",
          `${gameName} does not support ${gameType.toUpperCase()}`,
        );
        return;
      }

      let lobby = lobbies.get(lobbyId) as FPSGames.Lobby;
      if (!lobby) {
        // Select map pool based on game type
        const sourceMapPool = customMapPool
          ? customMapPool[gameName]
          : mapPool["fps"][gameName];
        const selectedMapPool =
          mapPoolSize === 4 ? sourceMapPool.slice(0, 4) : sourceMapPool;

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
            mapRulesList: mapRulesList,
            coinFlip: coinFlip ?? globalCoinFlip,
            admin: admin ?? false,
            knifeDecider: knifeDecider,
            mapPoolSize: mapPoolSize,
          },
          gameStep: 7 - mapPoolSize,
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
    }) => {
      const { lobbyId, gameType, customMapPool, coinFlip, admin } = data;
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
      lobby.teamNames.set(socket.id, teamName);
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
      if (lobby) {
        const actingSocketId = socketForTeam(lobby, teamName);
        const { socketId: otherSocketId } = otherTeam(lobby, teamName);

        // When picking a map, save it for later use
        const mapName = lobby.rules.mapNames[selectedMapIndex];
        socket.data.pickedMap = { map: mapName, teamName };

        // In BO1 the picking team also chooses the side; in longer series the
        // opponent does. Resolved by team so an admin proxy behaves the same.
        const targetSocket =
          lobby.rules.gameType === "bo1" ? actingSocketId : otherSocketId;
        const otherSocket =
          lobby.rules.gameType === "bo1" ? otherSocketId : actingSocketId;

        io.to(targetSocket).emit("backend.startPick", selectedMapIndex);
        io.to(otherSocket).emit("canWorkUpdated", false);
        io.to(otherSocket).emit("canPick", false);
      }
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
      if (lobby) {
        const sideTeamName = teamName;
        let mapTeamName = teamName;

        // Handle map picking based on game type and category
        let stateMessage = "";
        // For BO3/BO5, the other team picked the map
        stateMessage = `${mapTeamName} picked ${displayMap(map)}, ${sideTeamName} chose ${sideLabel(side)}`;
        if (lobby.rules.gameType !== "bo1") {
          stateMessage = `${teamName} chose ${sideLabel(side)} on ${displayMap(map)}`;
          io.to(lobbyId).emit("gameStateUpdated", stateMessage);
          for (const [, otherName] of lobby.teamNames.entries()) {
            if (otherName !== teamName) {
              mapTeamName = otherName;
              break;
            }
          }
        }
        (lobby as FPSGames.Lobby).pickedMaps.push({
          map,
          teamName: mapTeamName,
          side,
          sideTeamName,
        });

        lobby.gameStep++;

        // Clear temporary data
        if (socket.data.pickedMap) {
          delete socket.data.pickedMap;
        }

        // Control follows the team so an admin can pick on their behalf.
        const actingSocketId = socketForTeam(lobby, teamName);
        const { socketId: otherSocketId } = otherTeam(lobby, teamName);
        io.to(otherSocketId).emit("endPick");

        if (vetoInProgress(lobby)) {
          io.to(actingSocketId).emit("canWorkUpdated", true);
          if (lobby.rules.mapRulesList[lobby.gameStep] === "pick") {
            io.to(actingSocketId).emit("canPick", true);
            io.to(lobbyId).emit(
              "gameStateUpdated",
              teamName + " are picking a map",
            );
          } else if (lobby.rules.mapRulesList[lobby.gameStep] === "decider") {
            if ((lobby as FPSGames.Lobby).rules.knifeDecider) {
              io.to(otherSocketId).emit("canWorkUpdated", false);
              io.to(lobbyId).emit("canWorkUpdated", false);
              // Scoped to the current step's pool, which matters for CoD
              // where each mode resolves its own decider.
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
            } else if (!(lobby as FPSGames.Lobby).rules.knifeDecider) {
              io.to(actingSocketId).emit("canWorkUpdated", false);
              io.to(otherSocketId).emit("canWorkUpdated", true);
              io.to(otherSocketId).emit("canPick", true);
              io.to(lobbyId).emit(
                "gameStateUpdated",
                teamName + " are picking a map",
              );
            }
          } else if (lobby.rules.mapRulesList[lobby.gameStep] === "ban") {
            io.to(actingSocketId).emit("canBan", true);
            io.to(lobbyId).emit(
              "gameStateUpdated",
              teamName + " are banning a map",
            );
          }
        } else {
          io.to(lobbyId).emit("canWorkUpdated", false);
        }
        // After updating picked entries, add log
        console.log("Picked entries updated:", lobby.pickedMaps);
        io.to(lobbyId).emit("pickedUpdated", lobby.pickedMaps);
        broadcastAdminState(lobbyId);
      }
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
      if (lobby) {
        lobby.bannedMaps.push({ map, teamName });

        lobby.gameStep++;

        // Emit bannedUpdated to all clients, including observers
        io.to(lobbyId).emit("bannedUpdated", lobby.bannedMaps);

        // Clear the acting team's controls by team, not by caller, so an
        // admin banning on their behalf still hands the turn over correctly.
        const actingSocketId = socketForTeam(lobby, teamName);
        io.to(actingSocketId).emit("canWorkUpdated", false);
        io.to(actingSocketId).emit("canBan", false);

        const { socketId: otherSocketId, name: otherName } = otherTeam(
          lobby,
          teamName,
        );

        if (vetoInProgress(lobby)) {
          io.to(otherSocketId).emit("canWorkUpdated", true);
          if (
            (lobby as FPSGames.Lobby).rules.mapRulesList[lobby.gameStep] ===
            "pick"
          ) {
            io.to(otherSocketId).emit("canPick", true);
            io.to(lobbyId).emit(
              "gameStateUpdated",
              otherName + " are picking a map",
            );
          } else if (lobby.rules.mapRulesList[lobby.gameStep] === "decider") {
            if ((lobby as FPSGames.Lobby).rules.knifeDecider) {
              io.to(otherSocketId).emit("canWorkUpdated", false);
              io.to(lobbyId).emit("canWorkUpdated", false);
              // Scoped to the current step's pool, which matters for CoD
              // where each mode resolves its own decider.
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
            } else if (!(lobby as FPSGames.Lobby).rules.knifeDecider) {
              io.to(actingSocketId).emit("canWorkUpdated", false);
              io.to(otherSocketId).emit("canWorkUpdated", true);
              io.to(otherSocketId).emit("canPick", true);
              io.to(lobbyId).emit(
                "gameStateUpdated",
                teamName + " are picking a map",
              );
            }
          } else if (lobby.rules.mapRulesList[lobby.gameStep] === "ban") {
            io.to(otherSocketId).emit("canBan", true);
            io.to(lobbyId).emit(
              "gameStateUpdated",
              otherName + " are banning a map",
            );
          }
        } else {
          io.to(lobbyId).emit("canWorkUpdated", false);
        }
        broadcastAdminState(lobbyId);
      }
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
  });

  socket.on("admin.setObsLobby", (lobbyId: string) => {
    console.log("Setting OBS lobby:", lobbyId);
    const lobby = lobbies.get(lobbyId);
    if (lobby) {
      // Broadcast to all OBS views using the room
      io.to("obs_views").emit("admin.setObsLobby", lobbyId);

      // Send current game state data
      io.to("obs_views").emit("bannedUpdated", lobby.bannedMaps);
      io.to("obs_views").emit("pickedUpdated", lobby.pickedMaps);
      if (getGameCategory(lobby.rules.gameName) === "cod") {
        io.to("obs_views").emit(
          "vetoSequence",
          (lobby as CoDLobby).rules.vetoSequence,
        );
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);

    // Remove the socket ID from all lobbies it was in
    for (const lobbyId of socket.data.lobbies) {
      const lobby = lobbies.get(lobbyId);
      if (lobby !== undefined) {
        lobby.members.delete(socket.id);
        lobby.teamNames.delete(socket.id);
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
