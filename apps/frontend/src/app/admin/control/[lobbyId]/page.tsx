// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

/**
 * Admin veto console.
 *
 * Full manual control over a lobby: the operator picks which team they are
 * acting for and then bans or picks on that team's behalf. The backend
 * resolves turn control by team rather than by whoever sent the event, so a
 * team's own board stays in sync even when the admin drives.
 *
 * Built for the production desk — a team that has dropped, a captain reading
 * their bans out over comms, or a veto that has to be replayed.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { io, Socket } from "socket.io-client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CDN, slugify } from "@/lib/cdn";
import { mapLabel, modeLabel } from "@/lib/game-maps";

type VetoStep = { pool: string; action: string; gameNumber?: number };

type LobbyState = {
  lobbyId: string;
  gameName: string;
  gameType: string;
  category: "fps" | "cod";
  teamNames: string[];
  mapNames: string[];
  mapRulesList: string[];
  gameStep: number;
  currentAction: string | null;
  available: string[];
  bannedMaps: { map: string; teamName: string }[];
  pickedMaps: { map: string; teamName: string; side?: string }[];
  finished: boolean;
  vetoSequence: VetoStep[] | null;
};

const SIDES = [
  { id: "t", label: "Attack" },
  { id: "ct", label: "Defense" },
];

export default function AdminControlPage() {
  const { lobbyId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);

  const [state, setState] = useState<LobbyState | null>(null);
  const [actingTeam, setActingTeam] = useState<string>("");
  const [side, setSide] = useState<string>("t");
  const [missing, setMissing] = useState(false);

  const backendUrl =
    process.env.NODE_ENV === "development" ? "http://localhost:4000/" : "/";

  useEffect(() => {
    const socket = io(backendUrl);
    socketRef.current = socket;

    socket.on("connect", () => socket.emit("admin.watchLobby", lobbyId));
    socket.on("admin.lobbyState", (next: LobbyState) => {
      setState(next);
      // Default to the first team until the operator chooses otherwise.
      setActingTeam((current) => current || next.teamNames[0] || "");
    });
    socket.on("lobbyNotFound", () => setMissing(true));

    return () => {
      socket.emit("admin.unwatchLobby", lobbyId);
      socket.disconnect();
    };
  }, [backendUrl, lobbyId]);

  const act = useCallback(
    (map: string) => {
      const socket = socketRef.current;
      if (!socket || !state || !actingTeam) return;

      if (state.currentAction === "ban") {
        socket.emit("lobby.ban", { lobbyId, map, teamName: actingTeam });
      } else if (state.currentAction === "decider") {
        // A decider belongs to neither team — it is what is left over.
        socket.emit("lobby.pick", {
          lobbyId,
          map,
          teamName: "",
          side: "DECIDER",
        });
      } else {
        // `lobby.pick` is emitted by whoever chooses the *side*, and the map is
        // credited to the other team. In BO1 the picker takes their own side;
        // in longer series the opponent does. Sending the side-chooser here
        // keeps the map attributed to the team the operator selected.
        const opponent =
          state.teamNames.find((t) => t !== actingTeam) ?? actingTeam;
        socket.emit("lobby.pick", {
          lobbyId,
          map,
          teamName: state.gameType === "bo1" ? actingTeam : opponent,
          side,
        });
      }
      toast({
        description: `${actingTeam}: ${state.currentAction} ${mapLabel(map)}`,
      });
    },
    [state, actingTeam, side, lobbyId, toast],
  );

  if (missing) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold">
          Lobby {String(lobbyId)} not found
        </h1>
        <Button onClick={() => router.push("/admin")}>Back to admin</Button>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Connecting…</p>
      </main>
    );
  }

  const step = state.vetoSequence?.[state.gameStep];
  const isPick = state.currentAction === "pick";

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => router.push("/admin")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Admin
          </Button>
          <div className="flex items-center gap-4">
            {/*
              The pinned URL is the one to paste into OBS: it survives reloads
              on its own. "Send to overlay" stays for pushing this match to an
              already-open unpinned overlay.
            */}
            <Button
              onClick={() => {
                const url = `${window.location.origin}/obs?lobby=${lobbyId}`;
                navigator.clipboard.writeText(url).then(
                  () => toast({ description: `Copied ${url}` }),
                  () =>
                    toast({
                      description: "Could not copy the overlay URL",
                      variant: "destructive",
                    }),
                );
              }}
              className="h-10 rounded-sm border-2 border-[var(--kgf-flame)] bg-transparent px-5 font-bold uppercase tracking-wide text-[var(--kgf-flame)] hover:bg-[var(--kgf-flame)] hover:text-white"
            >
              Copy overlay URL
            </Button>
            <Button
              onClick={() => {
                socketRef.current?.emit("admin.setObsLobby", lobbyId);
                toast({
                  description: `Overlay now following lobby ${lobbyId}`,
                });
              }}
              className="h-10 rounded-sm border-0 bg-secondary px-5 font-bold uppercase tracking-wide text-secondary-foreground hover:bg-muted"
            >
              Send to overlay
            </Button>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {state.gameName} · {state.gameType.toUpperCase()}
              </div>
              <div className="text-2xl font-bold">Lobby {state.lobbyId}</div>
            </div>
          </div>
        </div>

        <div className="kgf-rule" />

        {/* Current step */}
        <section className="rounded-sm border border-border bg-card p-5">
          {state.finished ? (
            <p className="text-xl font-bold uppercase tracking-wide text-[var(--kgf-peach)]">
              Veto complete
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Step {state.gameStep + 1} of {state.mapRulesList.length}
              </span>
              <span className="text-2xl font-bold uppercase tracking-wide text-[var(--kgf-flame)]">
                {state.currentAction}
              </span>
              {step && (
                <span className="text-sm uppercase tracking-[0.16em] text-muted-foreground">
                  {modeLabel(`${step.pool}:x`)}
                  {step.gameNumber ? ` · Game ${step.gameNumber}` : ""}
                </span>
              )}
            </div>
          )}
        </section>

        {/* Acting team */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Acting on behalf of
          </h2>
          {state.teamNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teams have joined yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {state.teamNames.map((team) => (
                <Button
                  key={team}
                  onClick={() => setActingTeam(team)}
                  className={`h-11 px-6 rounded-sm font-bold uppercase tracking-wide border-0 ${
                    actingTeam === team
                      ? "bg-[var(--kgf-flame)] text-white"
                      : "bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {team}
                </Button>
              ))}
            </div>
          )}
        </section>

        {/* Side, picks only */}
        {isPick && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {state.gameType === "bo1"
                ? `Starting side for ${actingTeam || "the picking team"}`
                : `Opponent's starting side`}
            </h2>
            <div className="flex gap-3">
              {SIDES.map((s) => (
                <Button
                  key={s.id}
                  onClick={() => setSide(s.id)}
                  className={`h-10 px-6 rounded-sm font-bold uppercase tracking-wide border-0 ${
                    side === s.id
                      ? "bg-[var(--kgf-peach)] text-black"
                      : "bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </section>
        )}

        {/* Selectable maps */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {state.finished
              ? "Final selection"
              : `Choose a map to ${state.currentAction}`}
          </h2>
          {state.available.length === 0 && !state.finished ? (
            <p className="text-sm text-muted-foreground">
              Nothing selectable at this step.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {state.available.map((map) => (
                <button
                  key={map}
                  onClick={() => act(map)}
                  disabled={state.finished || !actingTeam}
                  className="group relative aspect-4/3 overflow-hidden rounded-sm border-2 border-border transition-all duration-200 hover:border-[var(--kgf-flame)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Image
                    src={CDN.map(state.gameName, slugify(mapLabel(map)))}
                    alt={mapLabel(map)}
                    fill
                    sizes="240px"
                    style={{ objectFit: "cover" }}
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1.5 text-sm font-bold uppercase tracking-wide text-white">
                    {mapLabel(map)}
                  </span>
                  {modeLabel(map) && (
                    <span className="absolute left-1 top-1 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white/85">
                      {modeLabel(map)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Running order */}
        <section className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Bans
            </h2>
            <ul className="space-y-1 text-sm">
              {state.bannedMaps.map((b, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="text-foreground">{mapLabel(b.map)}</span>
                  {modeLabel(b.map) ? ` · ${modeLabel(b.map)}` : ""} —{" "}
                  {b.teamName}
                </li>
              ))}
              {state.bannedMaps.length === 0 && (
                <li className="text-muted-foreground">None yet</li>
              )}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Picks
            </h2>
            <ul className="space-y-1 text-sm">
              {state.pickedMaps.map((p, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="text-foreground">{mapLabel(p.map)}</span>
                  {modeLabel(p.map) ? ` · ${modeLabel(p.map)}` : ""} —{" "}
                  {p.side === "DECIDER"
                    ? "Decider"
                    : `${p.teamName} (${p.side})`}
                </li>
              ))}
              {state.pickedMaps.length === 0 && (
                <li className="text-muted-foreground">None yet</li>
              )}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
