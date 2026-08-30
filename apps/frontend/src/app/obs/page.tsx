// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";
import AnimatedBanCard from "@/components/ui/ban";
import AnimatedPickCard from "@/components/ui/pick";
import AnimatedBanModeCard from "@/components/ui/ban_mode";
import AnimatedPickModeCard from "@/components/ui/pick_mode";
import AnimatedDeciderCard from "@/components/ui/decider";

interface BanAction {
  type: "ban";
  teamName: string;
  mapName: string;
}

interface BanModeAction {
  type: "ban_mode";
  teamName: string;
  mode: {
    mode: string;
    translatedMode: string;
  };
}

interface PickAction {
  type: "pick";
  teamName: string;
  mapName: string;
  side: string;
  sideTeamName: string;
}

interface PickModeAction {
  type: "pick_mode";
  teamName: string;
  sideTeamName: string;
  mode: {
    mode: string;
    translatedMode: string;
  };
}

interface DeciderAction {
  type: "decider";
  mapName: string;
}

type Action =
  | BanAction
  | BanModeAction
  | PickAction
  | PickModeAction
  | DeciderAction;

interface CardColors {
  ban: {
    text: string[];
    bg: string[];
  };
  pick: {
    text: string[];
    bg: string[];
  };
  pick_mode: {
    text: string[];
    bg: string[];
  };
  ban_mode: {
    text: string[];
    bg: string[];
  };
  decider: {
    text: string[];
    bg: string[];
  };
}

/** Breathing room kept around the card grid, in CSS pixels. */
const OVERLAY_MARGIN = 48;

/** Card footprint: 320px card + the 16px padding either side of it. */
const CARD_WIDTH = 352;
const CARD_GAP = 16;

/**
 * Above this many cards a single row has to shrink so far that map names stop
 * being readable on a 1080p stream, so we wrap onto a second row instead.
 */
const MAX_CARDS_PER_ROW = 7;

const ObsPage = () => {
  const [, setSelectedLobbyId] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  /**
   * A lobby in the URL (`/obs?lobby=9781`) pins this overlay to that match.
   *
   * Without it the overlay only learns which lobby to show when an admin
   * pushes one, so any reload — including the ones OBS does itself when a
   * scene activates — would leave the source blank mid-broadcast. Pinning it
   * makes the source recover on its own.
   */
  const searchParams = useSearchParams();
  const pinnedLobbyId = searchParams.get("lobby");

  const [pickedEntries, setPickedEntries] = useState<
    {
      map: string;
      teamName: string;
      side: string;
      sideTeamName: string;
      decider?: boolean;
    }[]
  >([]);
  const [bannedEntries, setBannedEntries] = useState<
    { map: string; teamName: string }[]
  >([]);
  const [bannedModeEntries, setBannedModeEntries] = useState<
    Array<{ mode: string; teamName: string; translatedMode?: string }>
  >([]);
  const [pattern, setPattern] = useState<string[]>([]);
  // Memoize defaultPickedMode to avoid dependency warning
  const defaultPickedMode = useMemo(
    () => ({
      mode: "",
      teamName: "",
      translatedMode: "",
    }),
    [],
  );
  const [pickedMode, setPickedMode] = useState<{
    mode: string;
    teamName: string;
    translatedMode: string;
  }>(defaultPickedMode);
  const [visibleActionsCount, setVisibleActionsCount] = useState(0);
  const [gameName, setGameName] = useState<string>("0");
  const [cardColors, setCardColors] = useState<CardColors>({
    ban: { text: [], bg: [] },
    pick: { text: [], bg: [] },
    pick_mode: { text: [], bg: [] },
    ban_mode: { text: [], bg: [] },
    decider: { text: [], bg: [] },
  });

  const backendUrl =
    process.env.NODE_ENV === "development" ? "http://localhost:4000/" : "/";

  useEffect(() => {
    // Fetch initial card colors from backend
    fetch(`${backendUrl}api/cardColors`)
      .then((res) => res.json())
      .then((data: CardColors) => setCardColors(data))
      .catch((err) => console.error("Error fetching card colors:", err));
  }, [backendUrl]);

  useEffect(() => {
    console.log("Initializing socket connection...");
    const newSocket = io(backendUrl);

    // Subscribe to whichever lobby the overlay should mirror, and pull its
    // current state so a mid-veto reload catches up instead of starting blank.
    const bindLobby = (lobbyId: string) => {
      console.log("Binding overlay to lobby:", lobbyId);
      newSocket.emit("joinLobby", lobbyId, "observer");
      newSocket.emit("obs.getPatternList", lobbyId);
      newSocket.emit("obs.getCurrentPickedMode", lobbyId);
      setSelectedLobbyId(lobbyId);
    };

    newSocket.on("connect", () => {
      console.log("Connected to Socket.IO server");
      console.log("Joining as observer");
      newSocket.emit("joinObsView");
      // Re-bind on every connect, so a dropped socket also recovers.
      if (pinnedLobbyId) {
        bindLobby(pinnedLobbyId);
      }
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from Socket.IO server");
    });

    newSocket.on("error", (error: Error) => {
      console.error("Socket error:", error);
    });

    newSocket.on("cardColorsUpdated", (newCardColors: CardColors) => {
      console.log("Card colors updated:", newCardColors);
      setCardColors(newCardColors);
    });

    // Admins can also push a lobby to unpinned overlays. A URL-pinned overlay
    // ignores these, so a source configured for one stream stays put.
    newSocket.on("admin.setObsLobby", (lobbyId: string) => {
      console.log("Received admin.setObsLobby event with lobby:", lobbyId);
      if (pinnedLobbyId) {
        console.log("Overlay is pinned to", pinnedLobbyId, "— ignoring push");
        return;
      }

      // Fade out, reset, then bind to the new match
      document.body.style.transition = "opacity 0.9s";
      document.body.style.opacity = "0";
      setTimeout(() => {
        document.body.style.opacity = "1";
        setVisibleActionsCount(0);
        setPickedMode(defaultPickedMode);
        setPickedEntries([]);
        setBannedEntries([]);
        setPattern([]); // Clear pattern before joining new lobby
        if (lobbyId) {
          bindLobby(lobbyId);
        }
      }, 900); // Match the transition duration
    });

    newSocket.on("gameName", (gameNameVar: string) => {
      console.log("Game name received:", gameNameVar);
      setGameName(gameNameVar);
    });

    newSocket.on(
      "pickedUpdated",
      (
        picked: Array<{
          map: string;
          teamName: string;
          side: string;
          sideTeamName: string;
          decider?: boolean;
        }>,
      ) => {
        console.log("Picked entries updated:", picked);
        setPickedEntries(picked);
      },
    );

    newSocket.on(
      "bannedUpdated",
      (banned: Array<{ map: string; teamName: string }>) => {
        console.log("Banned entries updated:", banned);
        setBannedEntries(banned);
      },
    );

    newSocket.on(
      "modesUpdated",
      (data: {
        banned: Array<{ mode: string; teamName: string }>;
        active: string[];
        modesSize: number;
      }) => {
        console.log("Mode bans updated:", data.banned);

        // Only reset UI when banned modes array is empty (indicating a new round)
        if (data.banned.length === 0) {
          console.log("New round detected - resetting UI");
          // First fade out the UI
          document.body.style.transition = "opacity 0.9s";
          document.body.style.opacity = "0";

          // Then update state variables AFTER the transition
          setTimeout(() => {
            document.body.style.opacity = "1";
            setVisibleActionsCount(0);
            setBannedModeEntries(data.banned);
            setPickedMode(defaultPickedMode);
            setBannedEntries([]);
            setPickedEntries([]);
          }, 900); // Match the transition duration
        } else {
          // Just update the banned modes without resetting UI
          setBannedModeEntries(data.banned);
        }
      },
    );

    newSocket.on("patternList", (pattern: string[]) => {
      console.log("Pattern list received:", pattern);
      setPattern(pattern);
    });

    newSocket.on(
      "modePicked",
      (data: { mode: string; teamName: string; translatedMode: string }) => {
        console.log("Mode picked event received:", data);
        if (data && data.mode && data.teamName) {
          setPickedMode(data);
        } else {
          console.warn("Received incomplete modePicked data:", data);
        }
      },
    );

    // Fallback for when modePicked event might be missed
    newSocket.on(
      "currentPickedMode",
      (
        data: { mode: string; teamName: string; translatedMode: string } | null,
      ) => {
        console.log("Current picked mode received:", data);
        if (data && data.mode && data.teamName) {
          setPickedMode(data);
        }
      },
    );

    // Handle 'clear' event from the server
    newSocket.on("backend.clear_obs", () => {
      console.log("Clearing OBS state");
      document.body.style.transition = "opacity 0.9s"; // Updated to make fade-out 3 times slower
      document.body.style.opacity = "0";
      setTimeout(() => {
        document.body.style.opacity = "1";
        setVisibleActionsCount(0);
        setPattern([]);
        setSelectedLobbyId(null);
        setPickedEntries([]);
        setBannedEntries([]);
        setPickedMode(defaultPickedMode);
      }, 900); // Match the updated transition duration
    });

    return () => {
      console.log("Cleaning up socket connection...");
      newSocket.disconnect();
    };
  }, [backendUrl, defaultPickedMode, pinnedLobbyId]);

  // Construct the final actions array based on the pattern and the data we have
  const actions: Action[] = useMemo(() => {
    console.log("Computing actions with:", {
      pattern,
      bannedEntries,
      bannedModeEntries,
      pickedEntries,
      pickedMode,
    });

    if (pattern.length === 0) {
      console.log("No pattern available, returning empty actions");
      return [];
    }

    const bannedCopy = [...bannedEntries];
    const bannedModeCopy = [...bannedModeEntries];
    const pickedModeCopy = pickedMode;
    const pickedCopy = [...pickedEntries];
    const finalActions: Action[] = [];

    // Process each step in the pattern exactly as defined
    pattern.forEach((step) => {
      if (step === "ban") {
        const banEntry = bannedCopy.shift();
        if (banEntry) {
          finalActions.push({
            type: "ban",
            teamName: banEntry.teamName,
            mapName: banEntry.map,
          });
        }
      } else if (step === "mode_ban") {
        const banEntry = bannedModeCopy.shift();
        if (banEntry) {
          finalActions.push({
            type: "ban_mode",
            teamName: banEntry.teamName,
            mode: {
              mode: banEntry.mode,
              translatedMode: banEntry.translatedMode || banEntry.mode,
            },
          });
        }
      } else if (step === "pick") {
        const pickEntry = pickedCopy.shift();
        if (pickEntry) {
          finalActions.push({
            type: "pick",
            teamName: pickEntry.teamName,
            mapName: pickEntry.map,
            side: pickEntry.side || "mode",
            sideTeamName: pickEntry.sideTeamName || pickEntry.teamName,
          });
        }
      } else if (step === "mode_pick" && pickedModeCopy.mode != "") {
        const pickEntry = pickedModeCopy;
        finalActions.push({
          type: "pick_mode",
          teamName: pickEntry.teamName,
          sideTeamName: pickEntry.teamName,
          mode: {
            mode: pickEntry.mode,
            translatedMode: pickEntry.translatedMode,
          },
        });
      } else if (step === "decider") {
        const pickEntry = pickedCopy.shift();
        if (pickEntry) {
          finalActions.push({
            type: "decider",
            mapName: pickEntry.map,
          });
        }
      }
    });

    console.log("Final actions computed:", finalActions);
    return finalActions;
  }, [bannedEntries, bannedModeEntries, pickedEntries, pattern, pickedMode]);

  // Reveal actions one by one with a 3-second delay
  useEffect(() => {
    console.log("Actions visibility effect:", {
      actionsLength: actions.length,
      visibleActionsCount,
    });

    // If the new actions array is shorter than what we have revealed, it's a reset scenario
    if (actions.length < visibleActionsCount) {
      console.log("Resetting visible actions count");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional reset when action list shrinks
      setVisibleActionsCount(() => 0);
      return;
    }

    if (actions.length > visibleActionsCount) {
      // There are new actions to reveal
      const intervalId = setInterval(() => {
        setVisibleActionsCount((prev) => {
          if (prev + 1 > actions.length) {
            clearInterval(intervalId);
            return prev;
          }
          return prev + 1;
        });
      }, 3000);

      return () => clearInterval(intervalId);
    }
  }, [actions, visibleActionsCount]);

  useEffect(() => {
    if (visibleActionsCount === 0) {
      document.body.style.transition = "opacity 0.9s"; // Updated to make fade-out 3 times slower
      document.body.style.opacity = "0";
      setTimeout(() => {
        document.body.style.opacity = "1";
        setVisibleActionsCount(0);
      }, 900); // Match the updated transition duration
    }
  }, [visibleActionsCount]);

  useEffect(() => {
    document.body.classList.add("obs-page");
    return () => document.body.classList.remove("obs-page");
  }, []);

  /**
   * Fit the whole veto onto the canvas.
   *
   * A full CoD BO5 is eleven 320px cards — nearly 4,000px — so on a 1920x1080
   * browser source the tail would run straight off the edge. Long vetoes wrap
   * onto a second row first (shrinking eleven cards into one row leaves the
   * map names too small to read on stream), and whatever remains is scaled
   * down to fit both dimensions.
   */
  const visibleCount = Math.min(visibleActionsCount, actions.length);
  const rows = visibleCount > MAX_CARDS_PER_ROW ? 2 : 1;
  const perRow = Math.ceil(visibleCount / rows) || 1;
  const gridWidth = perRow * CARD_WIDTH + (perRow - 1) * CARD_GAP;

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const fit = () => {
      // scrollWidth/Height are untransformed layout sizes, so they stay
      // stable no matter what scale is currently applied.
      const naturalW = row.scrollWidth;
      const naturalH = row.scrollHeight;
      if (!naturalW || !naturalH) return;

      const availableW = window.innerWidth - OVERLAY_MARGIN * 2;
      const availableH = window.innerHeight - OVERLAY_MARGIN * 2;
      setScale(Math.min(availableW / naturalW, availableH / naturalH, 1));
    };

    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [visibleCount, gridWidth]);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-transparent">
      <div
        ref={rowRef}
        // shrink-0 keeps the declared width: without it the parent flex
        // squeezes the grid and it wraps before the scale is ever applied.
        className="flex shrink-0 flex-wrap items-center justify-center gap-4"
        style={{
          width: gridWidth,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          // Ease the resize so adding a card never snaps the layout on stream
          transition: "transform var(--duration-slow, 360ms) ease-out",
        }}
      >
        {actions.slice(0, visibleActionsCount).map((action, index) => {
          // Skip rendering if cardColors is not yet populated
          console.log("Rendering action:", action);
          console.log("Card colors for action type:", cardColors[action.type]);
          if (!cardColors || !cardColors[action.type]) {
            console.log(
              "Skipping render due to missing card colors for type:",
              action.type,
            );
            return null;
          }

          switch (action.type) {
            case "ban":
              return (
                <AnimatedBanCard
                  key={index}
                  teamName={action.teamName}
                  mapName={action.mapName}
                  gameName={gameName}
                  cardColors={cardColors.ban}
                />
              );
            case "ban_mode":
              return (
                <AnimatedBanModeCard
                  key={index}
                  teamName={action.teamName}
                  mode={action.mode}
                  gameName={gameName}
                  cardColors={cardColors.ban_mode}
                />
              );
            case "pick":
              return (
                <AnimatedPickCard
                  key={index}
                  teamName={action.teamName}
                  sideTeamName={action.sideTeamName}
                  mapName={action.mapName}
                  gameName={gameName}
                  side={action.side}
                  cardColors={cardColors.pick}
                />
              );
            case "pick_mode":
              return (
                <AnimatedPickModeCard
                  key={index}
                  teamName={action.teamName}
                  sideTeamName={action.sideTeamName}
                  mode={action.mode}
                  gameName={gameName}
                  cardColors={cardColors.pick_mode}
                />
              );
            case "decider":
              return (
                <AnimatedDeciderCard
                  key={index}
                  mapName={action.mapName}
                  gameName={gameName}
                  cardColors={cardColors.decider}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    </div>
  );
};

export default ObsPage;
