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
import { ArrowLeft, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CDN, slugify } from "@/lib/cdn";
import { mapLabel, modeLabel } from "@/lib/game-maps";
import { stageLabel } from "@/lib/match-stage";
import { TeamCrest } from "@/components/ui/team-crest";

type VetoStep = {
  pool?: string;
  action: string;
  actor?: "A" | "B";
  sideActor?: "A" | "B";
  gameNumber?: number;
};

type LobbyState = {
  lobbyId: string;
  gameName: string;
  gameType: string;
  matchStage: string;
  category: "fps" | "cod";
  teamNames: string[];
  mapNames: string[];
  mapRulesList: string[];
  gameStep: number;
  currentAction: string | null;
  /** The team the published sequence has banning or picking at this step. */
  actingTeam: string;
  /** The team the sequence gives side selection on this step's map. */
  sideTeam: string;
  available: string[];
  bannedMaps: { map: string; teamName: string }[];
  pickedMaps: {
    map: string;
    teamName: string;
    side?: string;
    // Whoever chose the side, which in BO3/BO5 is the team that did *not* pick
    // the map.
    sideTeamName?: string;
  }[];
  liveGameIndex?: number;
  finished: boolean;
  vetoSequence: VetoStep[] | null;
};

/** Size presets offered to the operator; they map to `?size=` values. */
const OVERLAY_SIZES = [
  { id: "sm", label: "Small" },
  { id: "md", label: "Medium" },
  { id: "lg", label: "Full" },
];

const SIDES = [
  { id: "t", label: "Attack" },
  { id: "ct", label: "Defense" },
];

const sideLabel = (side?: string) =>
  SIDES.find((s) => s.id === side)?.label ?? side ?? "";

/**
 * One line of the running order.
 *
 * The map and the side can belong to different teams: in BO3/BO5 one team
 * picks the map and the other answers with the side. Naming both keeps the
 * operator from reading a side off against the wrong team.
 */
const describePick = (pick: {
  teamName: string;
  side?: string;
  sideTeamName?: string;
}) => {
  if (pick.side === "DECIDER") return "Decider";
  const side = sideLabel(pick.side);
  if (pick.sideTeamName && pick.sideTeamName !== pick.teamName) {
    return `${pick.teamName} — ${pick.sideTeamName} on ${side}`;
  }
  return `${pick.teamName} (${side})`;
};

export default function AdminControlPage() {
  const { lobbyId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);

  const [state, setState] = useState<LobbyState | null>(null);
  const [actingTeam, setActingTeam] = useState<string>("");
  // The step the selection above was last synced to, so an operator override
  // survives the state pushes that follow every action on this same step.
  const stepRef = useRef<number>(-1);
  const [side, setSide] = useState<string>("t");
  const [missing, setMissing] = useState(false);
  const [origin, setOrigin] = useState("");
  const [overlaySize, setOverlaySize] = useState("lg");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // The origin is only known in the browser, so the URLs are built after mount.
  // Reading it during render instead would make the server and client disagree
  // on the input's value and trip a hydration mismatch.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser-only value, read once on mount
    setOrigin(window.location.origin);
  }, []);

  /**
   * `size` is baked into the URL rather than stored per lobby, so one desk can
   * run the veto band full size on a stinger scene while the in-game strip sits
   * small over gameplay — and so a source keeps its own size across a reload.
   */
  const overlayUrl = origin
    ? `${origin}/obs?lobby=${lobbyId}${overlaySize === "lg" ? "" : `&size=${overlaySize}`}`
    : "";
  const liveUrl = origin
    ? `${origin}/obs/live?lobby=${lobbyId}${overlaySize === "lg" ? "" : `&size=${overlaySize}`}`
    : "";

  const copy = useCallback(
    (key: string, url: string) => {
      if (!url) return;
      navigator.clipboard.writeText(url).then(
        () => {
          setCopiedKey(key);
          setTimeout(() => setCopiedKey(null), 2000);
          toast({ description: "Overlay URL copied" });
        },
        () =>
          toast({
            description: "Could not copy the overlay URL",
            variant: "destructive",
          }),
      );
    },
    [toast],
  );

  const backendUrl =
    process.env.NODE_ENV === "development" ? "http://localhost:4000/" : "/";

  useEffect(() => {
    const socket = io(backendUrl);
    socketRef.current = socket;

    socket.on("connect", () => socket.emit("admin.watchLobby", lobbyId));
    socket.on("admin.lobbyState", (next: LobbyState) => {
      setState(next);
      // The published sequence decides whose turn it is, so the selection
      // follows the step rather than staying where the operator last left it.
      // A decider is nobody's pick — only its side is chosen.
      const onDuty =
        next.actingTeam || next.sideTeam || next.teamNames[0] || "";
      if (stepRef.current !== next.gameStep) {
        stepRef.current = next.gameStep;
        setActingTeam(onDuty);
      } else {
        setActingTeam((current) => current || onDuty);
      }
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
      } else {
        // `lobby.pick` is emitted by whoever chooses the *side*; the backend
        // credits the map itself to the team the sequence had pick it, and to
        // nobody on a decider, which is only what its pool had left over.
        socket.emit("lobby.pick", {
          lobbyId,
          map,
          teamName: state.sideTeam,
          side,
        });
      }
      toast({
        description: `${actingTeam || state.sideTeam}: ${state.currentAction} ${mapLabel(map)}`,
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
  const stepCaption = [
    step?.pool ? modeLabel(`${step.pool}:x`) : null,
    step?.gameNumber ? `Map ${step.gameNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // A decider settles no map — only one is left — but the rulebooks still name
  // a team to take the side on it, so it asks for one just like a pick does.
  const needsSide =
    state.currentAction === "pick" || state.currentAction === "decider";

  return (
    <main className="kgf-ember-page min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" onClick={() => router.push("/admin")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Admin
          </Button>
          <div className="flex items-center gap-5 text-right">
            <div className="kgf-eyebrow text-[var(--text-muted)]">
              {state.gameName} · {state.gameType.toUpperCase()}
              {stageLabel(state.matchStage) ? (
                <span className="ml-2 text-[var(--kgf-peach)]">
                  {stageLabel(state.matchStage)}
                </span>
              ) : null}
            </div>
            {/* The lobby code is data, not prose — tabular and widely tracked. */}
            <div className="kgf-cut-sm bg-[var(--surface-card)] border border-[var(--border-default)] px-4 py-1.5">
              <div className="kgf-eyebrow text-[var(--kgf-gray-500)] text-[10px]">
                Lobby
              </div>
              <div className="kgf-data text-2xl leading-none text-white">
                {state.lobbyId}
              </div>
            </div>
          </div>
        </div>

        <div className="kgf-rule" />

        {/*
          The pinned URL is the one to paste into OBS: it carries the lobby, so
          the source recovers on its own after the reloads OBS does when a scene
          activates. Showing it in full means the operator can read it back to
          whoever is running the stream. "Send to overlay" stays for pushing
          this match to an already-open overlay that was opened without a lobby.
        */}
        <section className="kgf-cut border border-[var(--border-default)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-hard-md)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="kgf-eyebrow text-[var(--text-muted)]">
              Browser source
            </h2>
            {/*
              Overlays already follow this lobby the moment the console opens,
              so this is only here to recover one that drifted — an OBS source
              left over from an earlier match, say.
            */}
            <Button
              onClick={() => {
                socketRef.current?.emit("admin.setObsLobby", lobbyId);
                toast({ description: `Overlays resynced to lobby ${lobbyId}` });
              }}
              variant="secondary"
              size="sm"
            >
              Resync overlays
            </Button>
          </div>

          {/*
            Overlay size lives in the URL. Different titles leave different
            amounts of room at the edges of the frame, so the operator picks a
            size here and it is baked into whichever link they copy.
          */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="kgf-eyebrow text-[var(--kgf-gray-500)]">Size</span>
            {OVERLAY_SIZES.map((option) => (
              <button
                key={option.id}
                onClick={() => setOverlaySize(option.id)}
                className={`kgf-cut-sm kgf-press h-9 border-2 px-4 font-display text-xs font-bold uppercase tracking-[0.06em] ${
                  overlaySize === option.id
                    ? "border-blaze bg-blaze/15 text-blaze"
                    : "border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {[
              {
                key: "veto",
                title: "Veto band",
                hint: "The full map-ban strip. Put it on the veto scene.",
                url: overlayUrl,
              },
              {
                key: "live",
                title: "In-game strip",
                hint: "Thin match bar for the top of the gameplay feed.",
                url: liveUrl,
              },
            ].map((row) => (
              <div key={row.key}>
                <div className="mb-2 flex items-baseline gap-3">
                  <span className="font-display text-sm font-bold uppercase tracking-[0.06em] text-white">
                    {row.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {row.hint}
                  </span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    readOnly
                    value={row.url}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={`${row.title} URL for an OBS browser source`}
                    className="kgf-cut-sm h-11 flex-1 border-2 border-[var(--border-default)] bg-black px-4 font-mono text-sm tracking-normal normal-case"
                  />
                  <Button
                    onClick={() => copy(row.key, row.url)}
                    className="h-11 shrink-0 border-blaze text-blaze hover:bg-blaze hover:text-white"
                    variant="outline"
                  >
                    {copiedKey === row.key ? (
                      <>
                        <Check className="mr-2 h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy link
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Both go into an OBS browser source at 1920×1080 — they position
            themselves within the frame, so the source itself is always full
            size. Both span the whole width whatever you pick above; size sets
            how much height they take, not how wide they run. Each reconnects to
            this lobby by itself after a reload, and a source already pointed at
            plain <span className="font-mono">/obs</span> follows this lobby on
            its own with nothing to press.
          </p>
        </section>

        {/*
          The step banner is the one thing the operator glances at between
          calls, so it is sized to be read from across a production desk, with
          a pip track showing how much of the veto is left.
        */}
        <section className="kgf-cut relative overflow-hidden border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-1"
            style={{
              background: state.finished
                ? "var(--kgf-peach)"
                : "var(--gradient-flame)",
            }}
          />
          {state.finished ? (
            <p className="pl-4 font-display text-3xl font-bold uppercase tracking-[-0.02em] text-[var(--kgf-peach)]">
              Veto complete
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 pl-4">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-display text-4xl font-bold uppercase leading-none tracking-[-0.02em] text-white">
                  {state.currentAction}
                </span>
                {/*
                  A ban names no map of the series and the tactical shooters
                  name no mode, so the two are joined only when both are there.
                */}
                {stepCaption && (
                  <span className="kgf-eyebrow text-[var(--text-muted)]">
                    {stepCaption}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="kgf-eyebrow text-[var(--kgf-gray-500)]">
                  Step{" "}
                  <span className="kgf-data text-white">
                    {state.gameStep + 1}
                  </span>{" "}
                  / {state.mapRulesList.length}
                </span>
                <div className="flex gap-1">
                  {state.mapRulesList.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-5 ${
                        i < state.gameStep
                          ? "bg-lava"
                          : i === state.gameStep
                            ? "bg-blaze"
                            : "bg-[var(--kgf-gray-700)]"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Acting team */}
        <section className="space-y-3">
          <h2 className="kgf-eyebrow text-[var(--text-muted)]">
            Acting on behalf of
            {state.actingTeam ? (
              <span className="ml-2 normal-case tracking-normal text-[var(--kgf-gray-500)]">
                — the sequence has {state.actingTeam} on this step
              </span>
            ) : null}
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
                  variant={actingTeam === team ? "default" : "secondary"}
                  className="h-12 gap-3 px-5 text-base"
                >
                  <TeamCrest name={team} size={28} />
                  {team}
                </Button>
              ))}
            </div>
          )}
        </section>

        {/* Side, on any step that resolves a map */}
        {needsSide && (
          <section className="space-y-3">
            <h2 className="kgf-eyebrow text-[var(--text-muted)]">
              Starting side for {state.sideTeam || "the choosing team"}
            </h2>
            <div className="flex gap-3">
              {SIDES.map((s) => (
                <Button
                  key={s.id}
                  onClick={() => setSide(s.id)}
                  variant={side === s.id ? "soft" : "secondary"}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </section>
        )}

        {/* Selectable maps */}
        <section className="space-y-3">
          <h2 className="kgf-eyebrow text-[var(--text-muted)]">
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
                  className="kgf-cut-sm kgf-press group relative aspect-4/3 overflow-hidden border-2 border-[var(--border-default)] shadow-[var(--shadow-hard-sm)] hover:border-blaze disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Image
                    src={CDN.map(state.gameName, slugify(mapLabel(map)))}
                    alt={mapLabel(map)}
                    fill
                    sizes="240px"
                    style={{ objectFit: "cover" }}
                    className="transition-transform duration-200 group-hover:scale-[1.04]"
                  />
                  {/* Protection scrim, so the name holds over any artwork. */}
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: "var(--gradient-protect)" }}
                  />
                  {/* A blaze wash on hover marks the map about to be acted on. */}
                  <span
                    aria-hidden
                    className="absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                    style={{ background: "var(--gradient-ember)" }}
                  />
                  <span className="absolute inset-x-0 bottom-0 px-3 py-2 text-left font-display text-sm font-bold uppercase tracking-[0.06em] text-white">
                    {mapLabel(map)}
                  </span>
                  {modeLabel(map) && (
                    <span className="kgf-eyebrow absolute left-2 top-2 bg-black/75 px-1.5 py-0.5 text-[10px] text-[var(--kgf-peach)]">
                      {modeLabel(map)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {/*
          Which game is on air.

          The veto fixes the running order but cannot know when the teams
          actually move to the next map, so the desk calls it. The in-game strip
          reads this to mark "now playing" and everything after it as "next".
        */}
        {state.pickedMaps.length > 0 && (
          <section className="space-y-3">
            <h2 className="kgf-eyebrow text-[var(--text-muted)]">
              Now playing — drives the in-game strip
            </h2>
            <div className="flex flex-wrap gap-3">
              {state.pickedMaps.map((pick, i) => {
                const isLive = (state.liveGameIndex ?? 0) === i;
                return (
                  <button
                    key={i}
                    onClick={() =>
                      socketRef.current?.emit("admin.setLiveGame", {
                        lobbyId,
                        index: i,
                      })
                    }
                    className={`kgf-cut-sm kgf-press h-11 border-2 px-4 font-display text-sm font-bold uppercase tracking-[0.06em] ${
                      isLive
                        ? "border-transparent bg-blaze text-white shadow-[var(--shadow-hard-sm)]"
                        : "border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-blaze hover:text-blaze"
                    }`}
                  >
                    <span className="kgf-data mr-2 opacity-70">{i + 1}</span>
                    {mapLabel(pick.map)}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Running order */}
        <section className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="kgf-eyebrow mb-3 text-[var(--text-muted)]">Bans</h2>
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
            <h2 className="kgf-eyebrow mb-3 text-[var(--text-muted)]">Picks</h2>
            <ul className="space-y-1 text-sm">
              {state.pickedMaps.map((p, i) => (
                <li key={i} className="text-muted-foreground">
                  <span className="text-foreground">{mapLabel(p.map)}</span>
                  {modeLabel(p.map) ? ` · ${modeLabel(p.map)}` : ""} —{" "}
                  {describePick(p)}
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
