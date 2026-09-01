// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

/**
 * Desk setup — the one screen between "I need a veto" and running it.
 *
 * Names both teams up front so the operator never has to wait for the teams to
 * connect: the veto is driven entirely from the control console afterwards.
 * Everything here is deliberately on a single screen, because it is filled in
 * under broadcast time pressure.
 */

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { MATCH_STAGE_OPTIONS, MatchStage } from "@/lib/match-stage";
import { resolveBackendUrl } from "@/lib/backend-url";
import { isRosteredTeam, rosterFor } from "@/lib/teams";
import { TeamPicker } from "@/components/ui/team-picker";

type GameOption = {
  id: string;
  prettyName: string;
  type: "fps" | "cod";
  formats: string[];
};

// Call of Duty runs the CDL formats; the tactical shooters run BO1/2/3/5.
const GAMES: GameOption[] = [
  {
    id: "r6",
    prettyName: "Rainbow Six Siege",
    type: "fps",
    formats: ["BO1", "BO2", "BO3", "BO5"],
  },
  {
    id: "valorant",
    prettyName: "Valorant",
    type: "fps",
    formats: ["BO1", "BO2", "BO3", "BO5"],
  },
  {
    id: "bo7",
    prettyName: "Black Ops 7",
    type: "cod",
    formats: ["BO1", "BO3", "BO5", "BO7"],
  },
];

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-2.5">
    <h2 className="kgf-eyebrow text-[var(--text-muted)]">{label}</h2>
    {children}
  </div>
);

/**
 * Segmented choice.
 *
 * Selection is carried by a blaze border and blaze text over a faint tint,
 * not a solid fill — a screen of solid blaze chips would compete with the one
 * action on the page that is genuinely a call to action.
 */
const chipClass = (selected: boolean) =>
  `kgf-cut-sm kgf-press h-11 border-2 px-4 font-display text-sm font-bold uppercase tracking-[0.06em] ${
    selected
      ? "border-blaze bg-blaze/15 text-blaze"
      : "border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-white"
  }`;

export default function AdminRunPage() {
  const router = useRouter();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);

  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [selectedGameId, setSelectedGameId] = useState("r6");
  const [gameType, setGameType] = useState("BO1");
  const [mapPoolSize, setMapPoolSize] = useState(7);
  // The KGF and CDL rulebooks both name a team to choose the side on the
  // decider, so the veto asks for it rather than leaving it to be settled
  // in game.
  const [knifeDecider, setKnifeDecider] = useState(false);
  const [matchStage, setMatchStage] = useState<MatchStage>("group");

  const [connected, setConnected] = useState(false);
  const [creating, setCreating] = useState(false);

  const backendUrl = resolveBackendUrl();

  const game = GAMES.find((g) => g.id === selectedGameId) ?? GAMES[0];
  const roster = rosterFor(selectedGameId);
  const isCoD = game.type === "cod";

  useEffect(() => {
    const socket = io(backendUrl);
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));

    socket.on("lobbyCreationError", (message: string) => {
      setCreating(false);
      toast({
        title: "Could not create the lobby",
        description: message,
        variant: "destructive",
      });
    });

    socket.on("admin.teamNamesError", (message: string) => {
      setCreating(false);
      toast({
        title: "Could not name the teams",
        description: message,
        variant: "destructive",
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [backendUrl, toast]);

  /**
   * A format the newly selected game has no rules for would only fail once the
   * server rejected it, so carry the choice over only when the new game also
   * offers it and fall back to BO1 otherwise — every game supports BO1.
   */
  const selectGame = (option: GameOption) => {
    setSelectedGameId(option.id);
    if (!option.formats.includes(gameType)) {
      setGameType("BO1");
    }

    // A team entered in the title being switched away from is not in this
    // one's bracket, so it is dropped. A name typed by hand is in nobody's
    // roster and is left alone — that is the operator overriding on purpose.
    const nextRoster = rosterFor(option.id);
    const stale = (name: string) =>
      isRosteredTeam(name) && !nextRoster.includes(name);
    if (stale(teamA)) setTeamA("");
    if (stale(teamB)) setTeamB("");
  };

  const handleCreate = () => {
    const socket = socketRef.current;
    if (!socket || !socket.connected || creating) return;

    const names: [string, string] = [
      teamA.trim() || "Team A",
      teamB.trim() || "Team B",
    ];
    if (names[0].toLowerCase() === names[1].toLowerCase()) {
      toast({
        description: "The two teams need different names",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    const lobbyId = Math.floor(1000 + Math.random() * 9000).toString();

    // The desk drives every turn by hand, so a coin flip decides nothing here.
    const shared = {
      lobbyId,
      customMapPool: null,
      admin: true,
      coinFlip: false,
      matchStage,
    };

    if (isCoD) {
      socket.emit("createCoDLobby", {
        ...shared,
        gameType: gameType.toLowerCase(),
      });
    } else {
      socket.emit("createFPSLobby", {
        ...shared,
        gameName: selectedGameId,
        gameType: gameType.toLowerCase(),
        knifeDecider,
        // BO3 and BO5 run over the whole official pool — nine maps for Siege,
        // seven for Valorant — which the backend sizes from the sequence
        // itself. This only decides BO1 and BO2.
        mapPoolSize,
      });
    }

    socket.once("lobbyCreated", () => {
      socket.emit("admin.setTeamNames", { lobbyId, teamNames: names });
    });

    socket.once("admin.teamNamesSet", () => {
      router.push(`/admin/control/${lobbyId}`);
    });
  };

  return (
    <main className="kgf-ember-page min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-7">
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push("/")}
            className="text-muted-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Home
          </Button>
          {/* A live dot reads faster than a word at a glance mid-broadcast. */}
          <span className="kgf-eyebrow flex items-center gap-2 text-[var(--text-muted)]">
            <span
              className={`h-2 w-2 ${connected ? "bg-blaze" : "bg-lava"}`}
              aria-hidden
            />
            {connected ? "Server connected" : "Connecting…"}
          </span>
        </div>

        <header>
          <h1 className="font-display text-4xl md:text-5xl font-bold uppercase leading-[0.9] tracking-[-0.02em]">
            <span className="text-white">New</span>{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-flame-soft)" }}
            >
              veto
            </span>
          </h1>
          <div className="kgf-rule mt-4 mb-3 w-40" />
          <p className="kgf-eyebrow text-[var(--kgf-gray-400)]">
            Name both teams, then run the bans from the control panel
          </p>
        </header>

        <div className="kgf-cut relative border border-[var(--border-default)] bg-[var(--surface-card)] p-6 md:p-7 shadow-[var(--shadow-hard-lg)]">
          <div className="space-y-6">
            {/*
              Picked from the title's entered roster, crest and all, rather
              than typed: the crest that goes on air is resolved from the name,
              so a misspelling is a missing logo mid-broadcast, not a typo.
            */}
            <Field label="Teams">
              <div className="grid gap-3 sm:grid-cols-2">
                <TeamPicker
                  value={teamA}
                  onChange={setTeamA}
                  teams={roster}
                  placeholder="Team A"
                  label="First team"
                />
                <TeamPicker
                  value={teamB}
                  onChange={setTeamB}
                  teams={roster}
                  placeholder="Team B"
                  label="Second team"
                />
              </div>
            </Field>

            <Field label="Round">
              <div className="grid grid-cols-5 gap-2">
                {MATCH_STAGE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setMatchStage(option.id)}
                    className={`${chipClass(option.id === matchStage)} px-1 text-[11px] tracking-[0.02em]`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Game">
              <div className="grid gap-3 sm:grid-cols-3">
                {GAMES.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => selectGame(option)}
                    className={chipClass(option.id === selectedGameId)}
                  >
                    {option.prettyName}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Series format">
              <div className="grid grid-cols-4 gap-3">
                {game.formats.map((format) => (
                  <button
                    key={format}
                    onClick={() => setGameType(format)}
                    className={chipClass(format === gameType)}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </Field>

            {/* Pool size and the decider are tactical-shooter concepts — CoD's
                pools are fixed by the CDL mode rotation. */}
            {!isCoD && ["BO1", "BO2"].includes(gameType) && (
              <Field label="Map pool size">
                <div className="grid grid-cols-2 gap-3">
                  {[4, 7].map((size) => (
                    <button
                      key={size}
                      onClick={() => setMapPoolSize(size)}
                      className={chipClass(size === mapPoolSize)}
                    >
                      {size} maps
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {!isCoD && ["BO1", "BO3", "BO5"].includes(gameType) && (
              <Field label="Decider side">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Team picks", value: false },
                    { label: "Settled in game", value: true },
                  ].map((option) => (
                    <button
                      key={option.label}
                      onClick={() => setKnifeDecider(option.value)}
                      className={chipClass(option.value === knifeDecider)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {/* The one hero CTA on the page, so it earns the brand gradient. */}
            <Button
              onClick={handleCreate}
              disabled={!connected || creating}
              variant="gradient"
              size="lg"
              className="w-full"
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create lobby & open control panel"
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
