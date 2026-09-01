// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

/**
 * In-game match strip.
 *
 * A single thin band for the top of the gameplay feed, cut into leaning
 * segments the way the broadcast reference does it: brand mark, the two teams
 * either side of the series score, then the map now playing and the ones still
 * to come. It carries no veto detail — the band has to survive being read in
 * peripheral vision while someone watches a firefight.
 *
 * Sized with `?size=` on the URL, because how much room the top of the frame
 * can spare differs from one title to the next.
 */

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { io } from "socket.io-client";
import { mapLabel, modeShortLabel } from "@/lib/game-maps";
import { CDN } from "@/lib/cdn";
import { TeamCrest } from "@/components/ui/team-crest";
import { isHeadlineStage, stageLabel } from "@/lib/match-stage";
import { resolveSize } from "../page";

/** The band's own height before the operator's size factor is applied. */
const STRIP_HEIGHT = 62;
/** The frame the band is drawn for. Anything else is a scale of it. */
const DESIGN_WIDTH = 1920;
/** How far each segment's top edge leans past its bottom. */
const SEG_SKEW = 18;

type PickedEntry = {
  map: string;
  teamName: string;
  side: string;
  sideTeamName: string;
};

/** The art file for a map, or null for a step that names no map yet. */
const mapArt = (gameName: string, mapId: string) =>
  mapId ? CDN.map(gameName, mapLabel(mapId)) : null;

/** One leaning segment of the band. */
const Segment = ({
  children,
  tone = "dark",
  grow = 0,
  align = "start",
  art = null,
}: {
  children: React.ReactNode;
  tone?: "dark" | "raised" | "live" | "brand";
  /**
   * Share of the frame's spare width this segment takes. The band is drawn to
   * the full width of the source, so something has to absorb whatever the
   * fixed blocks leave over — the segments carrying a team or a map do, since
   * they are the ones that gain from the room.
   */
  grow?: number;
  /** Which edge the content sits against once the segment has grown. */
  align?: "start" | "end";
  /**
   * Map artwork washed in behind the segment. Held well back — this band is
   * read in peripheral vision over live gameplay, so the art is there to make
   * the map recognisable at a glance, never to compete with the label.
   */
  art?: string | null;
}) => {
  const background =
    tone === "live"
      ? "var(--gradient-flame)"
      : tone === "brand"
        ? "var(--kgf-black)"
        : tone === "raised"
          ? "var(--kgf-gray-800)"
          : "var(--kgf-gray-900)";

  return (
    <div
      className={`relative flex h-full items-center gap-3 px-5 ${
        grow ? "min-w-0" : "shrink-0"
      } ${align === "end" ? "justify-end" : ""}`}
      style={{
        background,
        flex: grow ? `${grow} 1 0%` : undefined,
        clipPath: `polygon(${SEG_SKEW}px 0, 100% 0, calc(100% - ${SEG_SKEW}px) 100%, 0 100%)`,
        marginRight: -SEG_SKEW / 2,
      }}
    >
      {art && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `url(${art})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            // Enough to read the terrain, not enough to fight the text over it.
            opacity: tone === "live" ? 0.32 : 0.22,
            mixBlendMode: "luminosity",
          }}
        />
      )}
      <div className="relative flex h-full min-w-0 items-center gap-3">
        {children}
      </div>
    </div>
  );
};

const Stat = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) => (
  <div className="min-w-0 leading-none">
    <div
      className="kgf-eyebrow truncate text-[9px]"
      style={{ color: accent ? "var(--kgf-white)" : "var(--kgf-gray-400)" }}
    >
      {label}
    </div>
    <div
      className="truncate font-display text-[17px] font-bold uppercase leading-tight tracking-[-0.01em]"
      style={{ color: accent ? "var(--kgf-white)" : "var(--kgf-gray-100)" }}
    >
      {value}
    </div>
  </div>
);

const LiveStripPage = () => {
  const searchParams = useSearchParams();
  const pinnedLobbyId = searchParams.get("lobby");
  const sizeScale = resolveSize(searchParams.get("size"));
  /**
   * The round comes from the lobby, set on the run sheet. `?stage=` still
   * overrides it, so a director can caption a showmatch or a re-run without
   * anyone touching the desk.
   */
  const stageOverride = searchParams.get("stage");

  const boundLobbyRef = useRef<string | null>(null);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [picked, setPicked] = useState<PickedEntry[]>([]);
  const [liveIndex, setLiveIndex] = useState(0);
  const [gameName, setGameName] = useState("r6");
  const [matchStage, setMatchStage] = useState("group");
  /** How the source's real width compares to the 1920 the band is drawn at. */
  const [fit, setFit] = useState(1);

  const backendUrl =
    process.env.NODE_ENV === "development" ? "http://localhost:4000/" : "/";

  useEffect(() => {
    document.body.classList.add("obs-page");
    return () => document.body.classList.remove("obs-page");
  }, []);

  useEffect(() => {
    const measure = () => setFit(window.innerWidth / DESIGN_WIDTH);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const socket = io(backendUrl);

    const bindLobby = (lobbyId: string) => {
      boundLobbyRef.current = lobbyId;
      socket.emit("joinLobby", lobbyId, "observer");
      socket.emit("obs.getLiveGame", lobbyId);
    };

    socket.on("connect", () => {
      socket.emit("joinObsView");
      if (pinnedLobbyId) bindLobby(pinnedLobbyId);
    });

    // Same following rule as the veto band: pinned stays put, unpinned follows
    // whichever match the desk currently has open.
    socket.on("admin.setObsLobby", (lobbyId: string) => {
      if (pinnedLobbyId || !lobbyId) return;
      bindLobby(lobbyId);
    });

    socket.on("teamNamesUpdated", (entries: [string, string][]) =>
      setTeamNames(entries.map(([, name]) => name)),
    );
    socket.on("pickedUpdated", (entries: PickedEntry[]) => setPicked(entries));
    socket.on("liveGameUpdated", (index: number) => setLiveIndex(index));
    socket.on("gameName", (name: string) => setGameName(name));
    socket.on("matchStage", (value: string) => setMatchStage(value));

    return () => {
      socket.disconnect();
    };
  }, [backendUrl, pinnedLobbyId]);

  // A decider is a map in the running order like any other; only the label of
  // the segment changes, so the series list is just the picks in order.
  const series = picked;
  const live = series[liveIndex];
  const upcoming = series.slice(liveIndex + 1, liveIndex + 3);

  const stage = stageOverride ?? stageLabel(matchStage);
  // A final earns the flame; a group game gets the quiet treatment so the
  // accent still means something when it does appear.
  const stageIsHeadline = stageOverride ? false : isHeadlineStage(matchStage);

  /**
   * The band always spans the whole frame, so it reads as furniture built into
   * the broadcast rather than a card floating at the top of it.
   *
   * `?size=` therefore sets how *thick* the band is, not how wide: the row is
   * laid out wider than the frame by exactly the size factor and then scaled
   * back down by it, which lands the width on the frame every time and takes
   * the height (and the type with it) down proportionally.
   */
  const designWidth = DESIGN_WIDTH / sizeScale;
  const scale = sizeScale * fit;

  return (
    <div className="fixed inset-0 overflow-hidden bg-transparent">
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <div
          className="flex shrink-0 items-stretch"
          style={{
            width: designWidth,
            height: STRIP_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: "top center",
          }}
        >
          {/*
            Brand block — the festival lockup leads the band, as in the
            reference. The full lockup rather than the bare shield: this is the
            one place in the frame that says whose event this is.
          */}
          <Segment tone="brand">
            <Image
              src={CDN.lockup()}
              alt="Kurdistan Gaming Festival"
              width={112}
              height={38}
              style={{ objectFit: "contain" }}
              priority
            />
          </Segment>

          {stage && (
            <Segment tone={stageIsHeadline ? "live" : "raised"}>
              <div className="font-display text-[15px] font-bold uppercase tracking-[0.16em] text-white">
                {stage}
              </div>
            </Segment>
          )}

          {/* The two teams, flanking the series marker. */}
          <Segment grow={1.15}>
            <TeamCrest name={teamNames[0] ?? ""} size={34} />
            <Stat label="Team" value={teamNames[0] ?? "Team A"} />
          </Segment>

          <Segment tone="raised">
            <div className="kgf-data text-center text-[15px] leading-none text-[var(--kgf-peach)]">
              {series.length > 0
                ? `${Math.min(liveIndex + 1, series.length)} / ${series.length}`
                : "VS"}
            </div>
          </Segment>

          <Segment grow={1.15} align="end">
            <Stat label="Team" value={teamNames[1] ?? "Team B"} />
            <TeamCrest name={teamNames[1] ?? ""} size={34} />
          </Segment>

          {/*
            Now playing — the one segment carrying the flame gradient, with
            the map's own art washed in behind it so the band identifies the
            map by sight before anyone has read the name.
          */}
          <Segment
            tone="live"
            grow={1.4}
            art={live ? mapArt(gameName, live.map) : null}
          >
            <Stat
              label="Now playing"
              value={
                live
                  ? `${mapLabel(live.map)}${
                      modeShortLabel(live.map)
                        ? ` · ${modeShortLabel(live.map)}`
                        : ""
                    }`
                  : "Veto in progress"
              }
              accent
            />
          </Segment>

          {upcoming.map((entry, i) => (
            <Segment
              key={i}
              tone={i === 0 ? "raised" : "dark"}
              grow={1}
              art={mapArt(gameName, entry.map)}
            >
              <Stat label="Next" value={mapLabel(entry.map)} />
            </Segment>
          ))}

          {/* Tail cap, so the band ends on a clean diagonal not a raw edge. */}
          <div
            className="h-full w-6 shrink-0"
            style={{
              background: "var(--kgf-lava)",
              clipPath: `polygon(${SEG_SKEW}px 0, 100% 0, 100% 100%, 0 100%)`,
            }}
            aria-hidden
          />
          <span className="sr-only">{gameName}</span>
        </div>
      </div>
    </div>
  );
};

export default LiveStripPage;
