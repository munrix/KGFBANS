// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { io } from "socket.io-client";
import Image from "next/image";
import VetoSlice, { SLICE_SKEW } from "@/components/ui/veto-slice";
import { TeamCrest } from "@/components/ui/team-crest";
import { CDN } from "@/lib/cdn";
import { resolveBackendUrl } from "@/lib/backend-url";
import { isHeadlineStage, stageLabel } from "@/lib/match-stage";

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
  /**
   * A decider is nobody's pick, but the rulebooks still name a team to take
   * the side on it. Absent when the format leaves that to be settled in game.
   */
  side?: string;
  sideTeamName?: string;
}

type Action =
  | BanAction
  | BanModeAction
  | PickAction
  | PickModeAction
  | DeciderAction;

/**
 * The band runs the whole width of the frame — a veto strip that stops short
 * of the edges reads as a card dropped on the feed rather than as part of the
 * broadcast. Nothing is held back at either end.
 */
const OVERLAY_MARGIN = 0;

/** One slice of the band, at full size before any fitting is applied. */
const SLICE_WIDTH = 240;
const SLICE_HEIGHT = 250;
/** A sliver of the feed showing between slices, as in the reference. */
const SLICE_GAP = 4;

/**
 * Operator-chosen sizes, picked with `?size=` on the browser-source URL.
 *
 * Different titles leave different amounts of room at the edges of the frame,
 * so the same overlay has to sit smaller over one game than another. This only
 * buys back *height*: both overlays span the full width of the source at every
 * size, since a band that stops short of the edges reads as a card dropped on
 * the feed rather than as part of the broadcast.
 */
export const SIZE_PRESETS: Record<string, number> = {
  sm: 0.7,
  md: 0.85,
  lg: 1,
};

/** Resolve `?size=` — a preset name, or a raw percentage like `size=72`. */
export const resolveSize = (raw: string | null): number => {
  if (!raw) return SIZE_PRESETS.lg;
  const preset = SIZE_PRESETS[raw.toLowerCase()];
  if (preset) return preset;
  const pct = Number(raw);
  if (Number.isFinite(pct) && pct >= 25 && pct <= 200) return pct / 100;
  return SIZE_PRESETS.lg;
};

/**
 * How far the band may be squeezed before it wraps instead.
 *
 * The band always spans the full width of the frame, so a longer veto means a
 * smaller slice. That holds up to a point: a CoD BO7's thirteen steps land near
 * 0.6 and still read. A BO9 runs the BO3 block three times over for twenty-four
 * steps, which on one row would be a third of size — the map name is then a few
 * pixels tall and the band is decoration. Past this floor it takes a second row
 * rather than shrinking any further.
 */
const MIN_SCALE = 0.55;

/**
 * How many slices to put on a row.
 *
 * The rows are balanced rather than filled — a twenty-four step veto reads far
 * better as two rows of twelve than as a full row and a stub.
 */
export const columnsFor = (slots: number, availableW: number): number => {
  if (slots <= 0) return 0;
  const perRow = Math.max(
    1,
    Math.floor(
      (availableW / MIN_SCALE + SLICE_GAP) / (SLICE_WIDTH + SLICE_GAP),
    ),
  );
  const rows = Math.max(1, Math.ceil(slots / perRow));
  return Math.ceil(slots / rows);
};

/** The laid-out width of a row that many slices wide. */
export const rowWidth = (columns: number): number =>
  columns > 0
    ? columns * SLICE_WIDTH + (columns - 1) * SLICE_GAP + SLICE_SKEW
    : 0;

const ObsPage = () => {
  const [, setSelectedLobbyId] = useState<string | null>(null);
  /** Read inside socket handlers, so it has to be a ref rather than state. */
  const boundLobbyRef = useRef<string | null>(null);
  /**
   * Width of the frame the band has to fit. Seeded with the 1920 an OBS source
   * is configured at, so the first server-rendered pass matches the client's.
   */
  const [availableWidth, setAvailableWidth] = useState(1920);

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
  const sizeScale = resolveSize(searchParams.get("size"));

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
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [matchStage, setMatchStage] = useState("group");

  const backendUrl = resolveBackendUrl();

  useEffect(() => {
    console.log("Initializing socket connection...");
    const newSocket = io(backendUrl);

    // Subscribe to whichever lobby the overlay should mirror, and pull its
    // current state so a mid-veto reload catches up instead of starting blank.
    const bindLobby = (lobbyId: string) => {
      console.log("Binding overlay to lobby:", lobbyId);
      boundLobbyRef.current = lobbyId;
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

    /**
     * Which match an unpinned overlay is showing.
     *
     * The server sends this when the desk opens a lobby's console, so the
     * overlay follows along on its own. A URL-pinned overlay ignores it, and
     * so a source configured for one stream stays put.
     */
    newSocket.on("admin.setObsLobby", (lobbyId: string) => {
      console.log("Received admin.setObsLobby event with lobby:", lobbyId);
      if (pinnedLobbyId) {
        console.log("Overlay is pinned to", pinnedLobbyId, "— ignoring push");
        return;
      }

      if (lobbyId && boundLobbyRef.current === lobbyId) {
        // Already showing this match. Refresh in place rather than replaying
        // the fade-out, which would blank the source mid-veto.
        console.log("Already on lobby", lobbyId, "— refreshing in place");
        bindLobby(lobbyId);
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

    newSocket.on("matchStage", (stage: string) => setMatchStage(stage));

    newSocket.on("teamNamesUpdated", (entries: [string, string][]) =>
      setTeamNames(entries.map(([, name]) => name)),
    );

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
            side: pickEntry.side,
            sideTeamName: pickEntry.sideTeamName,
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
   * The strip runs the whole veto, not just what has happened.
   *
   * Every step in the pattern gets a slot from the start; the ones the veto has
   * not reached yet render as empty slices carrying the mark. That fixes the
   * band's width for the entire veto, so it never grows or reflows on stream —
   * the reference broadcast does the same, and a band that jumps mid-veto is
   * exactly what a director does not want.
   */
  const stage = stageLabel(matchStage);
  const stageIsHeadline = isHeadlineStage(matchStage);

  /** How tall each slice is drawn before the width fit is applied. */
  const sliceHeight = Math.round(SLICE_HEIGHT * sizeScale);

  const visibleCount = Math.min(visibleActionsCount, actions.length);
  const slotCount = Math.max(pattern.length, visibleCount);

  useEffect(() => {
    const measure = () =>
      setAvailableWidth(window.innerWidth - OVERLAY_MARGIN * 2);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /*
   * The band is laid out at full size and then scaled onto the frame, so the
   * geometry is worked out rather than measured — every slice is a fixed width
   * with a fixed gap, which makes the laid-out width exact.
   *
   * A row always ends up exactly the width of the frame, whether that means
   * shrinking a thirteen-step Call of Duty veto or stretching a seven-step one.
   * The operator's `?size=` is not applied here: it sets how tall the slices are
   * drawn, so a smaller overlay still spans the frame rather than shrinking away
   * from it.
   */
  const columns = columnsFor(slotCount, availableWidth);
  const rowCount = columns > 0 ? Math.ceil(slotCount / columns) : 0;
  const stripWidth = rowWidth(columns);
  const scale = stripWidth > 0 ? availableWidth / stripWidth : 1;
  return (
    <div className="fixed inset-0 overflow-hidden bg-transparent">
      {/*
        Anchored to the foot of the frame, the way a veto band sits under
        gameplay. `origin-bottom` means the operator's size choice shrinks the
        band toward the bottom edge rather than away from it.
      */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-6">
        {/*
          Title bar and band are scaled together, as one piece of furniture.
          Scaling them separately leaves each one's layout box at full size and
          opens a gap between them that grows the further the band is scaled.
        */}
        <div
          className="flex shrink-0 flex-col"
          style={{
            width: stripWidth,
            transform: `scale(${scale})`,
            transformOrigin: "bottom center",
            // Ease the resize so a new slice never snaps the band on stream.
            transition: "transform var(--duration-slow, 360ms) ease-out",
          }}
        >
          {/*
            Title bar over the band: the festival on the left, the two teams
            facing off on the right. A veto overlay is often the first thing a
            stream cuts to, so this is where the event has to be named — and the
            round with it, since a viewer arriving cold has nothing else to tell
            them what is at stake.
          */}
          <div className="mb-3 flex w-full items-stretch justify-between">
            <div className="flex items-stretch">
              <div
                className="flex items-center gap-3 px-5 py-2.5"
                style={{ background: "var(--kgf-black)" }}
              >
                <Image
                  src={CDN.lockup()}
                  alt="Kurdistan Gaming Festival"
                  width={132}
                  height={46}
                  style={{ objectFit: "contain" }}
                  priority
                />
              </div>

              {stage && (
                <div
                  className="flex items-center px-5"
                  style={{
                    background: stageIsHeadline
                      ? "var(--gradient-flame)"
                      : "var(--kgf-gray-800)",
                  }}
                >
                  <span className="font-display text-[15px] font-bold uppercase tracking-[0.18em] text-white">
                    {stage}
                  </span>
                </div>
              )}
            </div>

            {teamNames.length === 2 && (
              <div
                className="flex items-center gap-3 px-5"
                style={{ background: "var(--kgf-gray-900)" }}
              >
                <TeamCrest name={teamNames[0]} size={30} />
                <span className="font-display text-[15px] font-bold uppercase leading-none text-white">
                  {teamNames[0]}
                </span>
                <span className="kgf-eyebrow text-[10px] text-[var(--kgf-peach)]">
                  vs
                </span>
                <span className="font-display text-[15px] font-bold uppercase leading-none text-white">
                  {teamNames[1]}
                </span>
                <TeamCrest name={teamNames[1]} size={30} />
              </div>
            )}
          </div>

          {/*
            Rows, not one endless row. Short vetoes are a single row and look
            exactly as they always have; only a veto long enough to squeeze the
            type past reading takes a second one.
          */}
          <div className="flex flex-col" style={{ gap: SLICE_GAP }}>
            {Array.from({ length: rowCount }).map((_, row) => (
              <div
                key={row}
                // shrink-0 keeps the declared width: without it the parent flex
                // squeezes the strip and it wraps before the scale is applied.
                className="flex shrink-0 items-end"
                style={{ width: stripWidth, gap: SLICE_GAP }}
              >
                {Array.from({ length: columns }).map((_, column) => {
                  const index = row * columns + column;

                  // The last row is rarely full. It is padded rather than
                  // centred, so the veto still reads left to right in order.
                  if (index >= slotCount) {
                    return (
                      <div
                        key={column}
                        style={{ width: SLICE_WIDTH }}
                        aria-hidden
                      />
                    );
                  }

                  const action =
                    index < visibleActionsCount ? actions[index] : null;

                  // Mode-only steps have no map art of their own; they are
                  // legacy and no current format emits them, so they fall back
                  // to an empty slot.
                  if (
                    !action ||
                    action.type === "ban_mode" ||
                    action.type === "pick_mode"
                  ) {
                    return (
                      <VetoSlice
                        key={index}
                        variant="empty"
                        gameName={gameName}
                        index={index}
                        width={SLICE_WIDTH}
                        height={sliceHeight}
                      />
                    );
                  }

                  if (action.type === "decider") {
                    return (
                      <VetoSlice
                        key={index}
                        variant="decider"
                        mapName={action.mapName}
                        gameName={gameName}
                        side={action.side}
                        sideTeamName={action.sideTeamName}
                        index={index}
                        width={SLICE_WIDTH}
                        height={sliceHeight}
                      />
                    );
                  }

                  if (action.type === "pick") {
                    return (
                      <VetoSlice
                        key={index}
                        variant="pick"
                        mapName={action.mapName}
                        teamName={action.teamName}
                        gameName={gameName}
                        side={action.side}
                        sideTeamName={action.sideTeamName}
                        index={index}
                        width={SLICE_WIDTH}
                        height={sliceHeight}
                      />
                    );
                  }

                  return (
                    <VetoSlice
                      key={index}
                      variant="ban"
                      mapName={action.mapName}
                      teamName={action.teamName}
                      gameName={gameName}
                      index={index}
                      width={SLICE_WIDTH}
                      height={sliceHeight}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ObsPage;
