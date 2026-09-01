// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { CDN } from "../lib/cdn";
import { AnimatePresence, motion } from "framer-motion";
import { io, Socket } from "socket.io-client";
import { fetchMapPool } from "@/lib/utils";
import { resolveBackendUrl } from "@/lib/backend-url";
import { Shield, SlidersHorizontal } from "lucide-react";
import { FooterBar } from "@/components/ui/footer-bar";
import { GameSelectionOverlay } from "@/components/overlays/GameSelectionOverlay";
import { SettingsOverlay } from "@/components/overlays/SettingsOverlay";
import { MapPoolEditorOverlay } from "@/components/overlays/MapPoolEditorOverlay";
import { MatchStage } from "@/lib/match-stage";

const availableGames = [
  {
    id: "r6",
    prettyName: "Rainbow Six Siege",
    type: "fps",
    developer: "Ubisoft",
  },
  {
    id: "valorant",
    prettyName: "Valorant",
    type: "fps",
    developer: "Riot Games",
  },
  {
    id: "bo7",
    prettyName: "Black Ops 7",
    type: "cod",
    developer: "Activision",
  },
];

export default function HomePage() {
  const [lobbyId, setLobbyId] = useState("");
  const otpWrapperRef = useRef<HTMLDivElement | null>(null);
  type Overlay = "none" | "game" | "settings" | "mapPool";
  const [overlay, setOverlay] = useState<Overlay>("none");
  const router = useRouter();
  const { toast } = useToast();

  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [gameType, setGameType] = useState("BO1");
  const [selectedGameId, setSelectedGameId] = useState<string>("r6");
  // The KGF and CDL rulebooks both name a team to choose the side on the
  // decider, so the veto asks for it rather than leaving it to be settled
  // in game.
  const [localKnifeDecider, setLocalKnifeDecider] = useState(false);
  const [matchStage, setMatchStage] = useState<MatchStage>("group");
  const [mapPoolSize, setMapPoolSize] = useState<number>(7);
  const [creatingLobby, setCreatingLobby] = useState(false);

  // removed activeTab since map pool editor now only shows selected game's maps
  const [allMapsList, setAllMapsList] = useState<Record<string, string[]>>({});
  const [mapPool, setMapPool] = useState<Record<string, string[]>>({});
  const [mapPoolDraft, setMapPoolDraft] = useState<Record<string, string[]>>(
    {},
  );
  const [defaultMapPool, setDefaultMapPool] = useState<
    Record<string, string[]>
  >({});
  const [useCustomMapPool, setUseCustomMapPool] = useState(false);

  const [connectionError, setConnectionError] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [buildVersion, setBuildVersion] = useState<string>("");

  const backendUrl = resolveBackendUrl();

  const fetchMapPoolData = useCallback(async () => {
    try {
      const result = await fetchMapPool(backendUrl);

      if (result.success) {
        setMapPool(result.mapPool);
        setDefaultMapPool(result.mapPool);
        setAllMapsList(result.mapNamesLists);
      } else {
        console.warn("Failed to fetch map pool, keeping previous values");
      }
    } catch (error) {
      console.error("Error in fetchMapPoolData:", error);
    }
  }, [backendUrl]);

  useEffect(() => {
    const newSocket = io(backendUrl, {
      reconnectionAttempts: 3,
      timeout: 3000,
    });

    newSocket.on("connect", () => {
      setIsConnecting(false);
      setConnectionError(false);
      setSocketConnected(true);
    });

    newSocket.on("connect_error", () => {
      setIsConnecting(false);
      setConnectionError(true);
      setSocketConnected(false);
    });

    newSocket.on("lobbyCreationError", (errorMessage: string) => {
      setCreatingLobby(false);
      toast({
        title: "Could not create lobby",
        description: errorMessage,
        variant: "destructive",
      });
      router.push("/");
    });

    socketRef.current = newSocket;

    return () => {
      newSocket.disconnect();
    };
  }, [backendUrl, router, toast]);

  // Fetch map pool data on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional data fetch on mount
    fetchMapPoolData();
  }, [fetchMapPoolData]);

  const handleJoinLobby = async () => {
    if (lobbyId && lobbyId.length === 4) {
      try {
        if (!socketRef.current?.connected) {
          toast({
            description: "Could not connect to the server",
            variant: "destructive",
          });
          return;
        }

        const checkLobbyExists = new Promise((resolve, reject) => {
          const s = socketRef.current;
          if (!s) {
            reject(new Error("Socket not connected"));
            return;
          }
          s.emit("getLobbyGameCategory", lobbyId);

          const timeoutId = setTimeout(() => {
            cleanup();
            reject(new Error("Timeout waiting for server response"));
          }, 5000);

          const handleLobbyNotFound = () => {
            clearTimeout(timeoutId);
            cleanup();
            reject(new Error("Lobby does not exist"));
          };

          const handleSuccess = (payload?: unknown) => {
            clearTimeout(timeoutId);
            cleanup();
            resolve(payload);
          };

          function cleanup() {
            if (s) {
              s.off("lobbyNotFound", handleLobbyNotFound);
              s.off("lobbyGameCategory", handleSuccess);
            }
          }

          s.once("lobbyNotFound", handleLobbyNotFound);
          s.once("lobbyGameCategory", handleSuccess);
        });

        const category = await checkLobbyExists;
        // Determine route based on payload
        let routeBase = "/lobby";
        const lower =
          typeof category === "string" ? category.toLowerCase() : "fps";
        if (lower === "fps") routeBase = "/fps";
        if (lower === "cod") routeBase = "/cod";
        router.push(`${routeBase}/${lobbyId}`);
      } catch {
        toast({
          description: "Lobby does not exist",
          variant: "destructive",
        });
      }
    } else {
      toast({
        description: "Enter a valid lobby code",
        variant: "destructive",
      });
    }
  };

  const handleCreateLobby = () => {
    const socket = socketRef.current;
    if (socket) {
      if (creatingLobby) return;
      setCreatingLobby(true);
      const lobbyId = Math.floor(1000 + Math.random() * 9000).toString();

      if (selectedGameId === "bo7") {
        socket.emit("createCoDLobby", {
          lobbyId,
          gameType: gameType.toLowerCase(),
          customMapPool: useCustomMapPool ? mapPool : null,
          admin: false,
          matchStage,
        });

        socket.once("lobbyCreated", () => {
          setCreatingLobby(false);
          setOverlay("none");
          router.push(`/cod/${lobbyId}`);
        });
      } else {
        socket.emit("createFPSLobby", {
          lobbyId,
          gameName: selectedGameId,
          gameType: gameType.toLowerCase(),
          knifeDecider: localKnifeDecider,
          // BO3 and BO5 run over the whole official pool — nine maps for Siege,
          // seven for Valorant — which the backend sizes from the published
          // sequence. This only decides BO1 and BO2.
          mapPoolSize,
          customMapPool: useCustomMapPool ? mapPool : null,
          matchStage,
        });

        socket.once("lobbyCreated", () => {
          setCreatingLobby(false);
          setOverlay("none");
          router.push(`/fps/${lobbyId}`);
        });
      }
    }
  };

  const handleOpenMapPoolEditor = async () => {
    if (!useCustomMapPool) {
      await fetchMapPoolData();
    }
    setMapPoolDraft({
      ...mapPool,
      r6: [...(mapPool.r6 || [])],
      valorant: [...(mapPool.valorant || [])],
    });
    setOverlay("mapPool");
  };

  const handleSelectChange = (
    index: number,
    value: string,
    gameName: string,
  ) => {
    const source = mapPoolDraft[gameName] || [];
    const newPoolForGame = [...source];
    newPoolForGame[index] = value;
    if (gameName === "r6") {
      setMapPoolDraft({
        r6: newPoolForGame,
        valorant: mapPoolDraft["valorant"] || [],
      });
    } else {
      setMapPoolDraft({
        r6: mapPoolDraft["r6"] || [],
        valorant: newPoolForGame,
      });
    }
  };

  const handleResetMapPool = () => {
    const next = {
      r6: [...(defaultMapPool.r6 || [])],
      valorant: [...(defaultMapPool.valorant || [])],
    } as Record<string, string[]>;

    setMapPool(next);
    setMapPoolDraft(next);
    setUseCustomMapPool(false);
    setOverlay("settings");

    toast({
      description: "Map pool reset to default",
    });
  };

  const handleSaveMapPool = () => {
    if (
      !Array.isArray(mapPoolDraft["r6"]) ||
      !Array.isArray(mapPoolDraft["valorant"])
    ) {
      toast({ description: "Map pool not loaded", variant: "destructive" });
      return;
    }
    const uniqueValuesZero = new Set(mapPoolDraft["r6"]);
    const uniqueValuesOne = new Set(mapPoolDraft["valorant"]);

    if (
      uniqueValuesZero.size !== mapPool["r6"].length ||
      uniqueValuesOne.size !== mapPool["valorant"].length
    ) {
      toast({
        description: "Maps must not repeat",
        variant: "destructive",
      });
      return;
    }

    setMapPool({
      r6: [...(mapPoolDraft.r6 || [])],
      valorant: [...(mapPoolDraft.valorant || [])],
    });

    const differs = (a: string[] = [], b: string[] = []) =>
      a.length !== b.length || a.some((v, i) => v !== b[i]);
    const changed =
      differs(mapPoolDraft.r6, defaultMapPool.r6) ||
      differs(mapPoolDraft.valorant, defaultMapPool.valorant);
    setUseCustomMapPool(changed);

    setOverlay("settings");

    toast({
      description: changed
        ? "Map pool changes saved"
        : "Using the default map pool",
    });
  };

  const selectedGameInfo = availableGames.find((g) => g.id === selectedGameId);

  useEffect(() => {
    fetch("/version")
      .then((res) => {
        if ([200, 301, 302].includes(res.status)) {
          return res.text();
        }
        throw new Error("Unexpected response status");
      })
      .then((ver) => {
        if (/^\d+\.\d+\.\d+$/.test(ver.trim())) {
          setBuildVersion(
            process.env.NODE_ENV === "development"
              ? `${ver.trim()}-dev`
              : ver.trim(),
          );
        } else {
          throw new Error("Invalid version format");
        }
      })
      .catch(() =>
        setBuildVersion(process.env.NODE_ENV === "development" ? "0-dev" : "0"),
      );
  }, []);

  useEffect(() => {
    if (!isConnecting && !connectionError) {
      const id = setTimeout(() => {
        const el = otpWrapperRef.current?.querySelector(
          'input, [contenteditable="true"]',
        ) as HTMLInputElement | null;
        el?.focus();
      }, 0);
      return () => clearTimeout(id);
    }
  }, [isConnecting, connectionError]);

  return (
    // `pb-24` keeps the card clear of the fixed footer bar. `kgf-ember` lays
    // the official pixel-flame pattern over absolute black.
    <div className="kgf-ember-page min-h-screen bg-background flex items-center justify-center p-6 pb-20 overflow-hidden">
      {/* A single blaze wedge behind the card, the brand's hero treatment. */}
      <div
        aria-hidden
        className="pointer-events-none fixed -left-40 -top-40 h-[36rem] w-[36rem] rounded-full opacity-[0.16] blur-[120px]"
        style={{ background: "var(--gradient-flame)" }}
      />

      {/* Production desk entry point — the veto can be run entirely from here */}
      <button
        onClick={() => router.push("/admin")}
        className="kgf-cut-sm kgf-press fixed top-5 right-5 z-40 flex items-center gap-2 border-2 border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-2 text-xs font-display font-bold uppercase tracking-[0.16em] text-[var(--text-muted)] hover:border-blaze hover:text-blaze"
      >
        <Shield className="h-3.5 w-3.5" />
        Admin
      </button>

      <AnimatePresence mode="wait">
        {(connectionError || isConnecting) && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center space-y-6"
          >
            <motion.div
              animate={
                !connectionError
                  ? {
                      scale: [1, 1.1, 1],
                      opacity: [0.6, 0.9, 0.6],
                    }
                  : {}
              }
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Image
                src={CDN.brand()}
                alt="CSM"
                width={80}
                height={21}
                className="opacity-60"
                priority={true}
              />
            </motion.div>

            <div className="flex flex-col items-center space-y-4">
              {connectionError ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="kgf-cut-sm flex h-12 w-12 items-center justify-center bg-lava">
                    <span className="text-xl text-white">⚠</span>
                  </div>
                  <div className="text-center space-y-3">
                    <div>
                      <p className="font-display text-sm font-bold uppercase tracking-[0.06em] text-white">
                        Could not connect to the Munrix server
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Please try again later
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setConnectionError(false);
                        setIsConnecting(true);
                        window.location.reload();
                      }}
                      variant="primary"
                    >
                      Try again
                    </Button>
                  </div>
                </div>
              ) : null}

              {!connectionError && (
                <div className="text-center">
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    {isConnecting
                      ? "Connecting to server..."
                      : "Loading data..."}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                    {isConnecting ? "Establishing connection" : "Please wait"}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
        {!isConnecting && !connectionError && (
          <motion.div
            key="main-content"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
              className="text-center mb-7"
            >
              <Image
                src={CDN.brand()}
                alt="Kurdistan Gaming Festival"
                width={132}
                height={36}
                priority={true}
                className="mx-auto mb-4 opacity-90 cursor-pointer hover:opacity-100 transition-opacity duration-200"
                onClick={() => {
                  toast({
                    title: "Munrix Bans",
                    description: `Version v${buildVersion}`,
                  });
                }}
              />
              {/*
                The wordmark's own rhythm: the name tight and heavy, the
                descriptor small and widely tracked beneath it. The gradient
                is sanctioned on a display lockup like this one.
              */}
              <h1 className="font-display text-4xl md:text-5xl font-bold uppercase tracking-[-0.02em] leading-[0.9]">
                <span className="block text-white">Munrix</span>
                <span
                  className="block bg-clip-text text-transparent"
                  style={{ backgroundImage: "var(--gradient-flame-soft)" }}
                >
                  Bans
                </span>
              </h1>
              <div className="kgf-rule mx-auto mt-4 mb-3 w-32" />
              <p className="kgf-eyebrow text-[var(--kgf-gray-400)]">
                Map veto &amp; broadcast overlays
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="kgf-cut relative border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-hard-lg)]"
            >
              <div className="space-y-4">
                {/*
                  The desk runs the veto, so that is the primary action here.
                  Joining a lobby stays available underneath for the days teams
                  ban for themselves.
                */}
                <div className="space-y-3">
                  <label className="kgf-eyebrow block text-[var(--text-muted)]">
                    Production desk
                  </label>
                  <Button
                    onClick={() => router.push("/admin/run")}
                    size="lg"
                    className="w-full"
                  >
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    Run a map ban
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Create a lobby, name both teams, and ban for both sides
                  </p>
                </div>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full h-px bg-[var(--border-default)]"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[var(--surface-card)] px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.34em] text-[var(--kgf-gray-500)]">
                      or join a lobby
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="kgf-eyebrow block text-[var(--text-muted)]">
                    Lobby code
                  </label>
                  <div className="flex justify-center" ref={otpWrapperRef}>
                    <InputOTP
                      maxLength={4}
                      pattern={REGEXP_ONLY_DIGITS}
                      value={lobbyId}
                      onChange={(value) => setLobbyId(value)}
                      autoFocus
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter" && lobbyId.length === 4) {
                          handleJoinLobby();
                        }
                      }}
                    >
                      <InputOTPGroup className="gap-2">
                        {[0, 1, 2, 3].map((index) => (
                          <InputOTPSlot
                            key={index}
                            index={index}
                            className="kgf-data kgf-cut-sm w-12 h-12 md:w-14 md:h-14 text-2xl border border-[var(--border-default)] bg-[var(--surface-raised)] text-white transition-colors duration-200 data-[active=true]:border-blaze data-[active=true]:ring-2 data-[active=true]:ring-blaze/40"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {lobbyId.length === 4 ? (
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 text-center">
                      Press Enter to join
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-500 dark:text-neutral-500 text-center">
                      Enter the 4-digit code
                    </p>
                  )}

                  {/* Neutral fill, so the desk button above stays the only
                      flame-coloured call to action on the page. */}
                  <Button
                    onClick={() => {
                      if (lobbyId.length !== 4) {
                        toast({
                          description: "Enter a lobby code",
                          variant: "destructive",
                        });
                        return;
                      }
                      handleJoinLobby();
                    }}
                    variant={lobbyId.length === 4 ? "soft" : "secondary"}
                    className="w-full"
                    disabled={lobbyId.length !== 4}
                  >
                    Join lobby
                  </Button>
                </div>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full h-px bg-[var(--border-default)]"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[var(--surface-card)] px-3 py-1 font-display text-[10px] font-bold uppercase tracking-[0.34em] text-[var(--kgf-gray-500)]">
                      or
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => setOverlay("game")}
                  variant="outline"
                  className="w-full"
                  disabled={!socketConnected}
                >
                  Create your own lobby
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isConnecting && !connectionError && (
        <FooterBar
          repoUrl="https://git.csmpro.ru/csmpro/mapban"
          licenseUrl="https://git.csmpro.ru/csmpro/mapban#license-and-trademark-notice"
          version={buildVersion}
        />
      )}

      <AnimatePresence mode="wait">
        {overlay === "game" && (
          <GameSelectionOverlay
            games={availableGames}
            onSelect={(id) => {
              setSelectedGameId(id);
              setOverlay("settings");
            }}
            onCancel={() => setOverlay("none")}
          />
        )}
        {overlay === "settings" && (
          <SettingsOverlay
            gamePrettyName={selectedGameInfo?.prettyName}
            gameType={gameType}
            matchStage={matchStage}
            setMatchStage={setMatchStage}
            setGameType={setGameType}
            localKnifeDecider={localKnifeDecider}
            setLocalKnifeDecider={setLocalKnifeDecider}
            mapPoolSize={mapPoolSize}
            setMapPoolSize={setMapPoolSize}
            type={selectedGameInfo?.type}
            onBack={() => setOverlay("game")}
            onOpenMapPool={handleOpenMapPoolEditor}
            onCreate={handleCreateLobby}
            creating={creatingLobby}
            disabled={!socketConnected}
            mapPoolChanged={useCustomMapPool}
          />
        )}
        {overlay === "mapPool" && (
          <MapPoolEditorOverlay
            gameId={selectedGameId === "valorant" ? "valorant" : "r6"}
            gamePrettyName={selectedGameInfo?.prettyName}
            mapPool={mapPoolDraft}
            allMapsList={allMapsList}
            onChange={handleSelectChange}
            onBack={() => setOverlay("settings")}
            onReset={handleResetMapPool}
            onSave={handleSaveMapPool}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
