// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { OverlayShell } from "@/components/ui/overlay-shell";
import { MATCH_STAGE_OPTIONS, MatchStage } from "@/lib/match-stage";

export type SettingsOverlayProps = {
  gamePrettyName?: string;
  gameType: string;
  setGameType: (t: string) => void;
  matchStage: MatchStage;
  setMatchStage: (s: MatchStage) => void;
  localKnifeDecider: boolean;
  setLocalKnifeDecider: (v: boolean) => void;
  mapPoolSize: number;
  setMapPoolSize: (n: number) => void;
  type: "fps" | "cod" | string | undefined;
  onBack: () => void;
  onOpenMapPool: () => void;
  onCreate: () => void;
  creating: boolean;
  disabled?: boolean;
  mapPoolChanged?: boolean;
  // Optional admin-only controls
  showCoinFlip?: boolean;
  coinFlip?: boolean;
  setCoinFlip?: (v: boolean) => void;
};

// Call of Duty runs the CDL formats plus the BO9; the tactical shooters run
// BO1/2/3/5.
const formatsByType: Record<string, string[]> = {
  fps: ["BO1", "BO2", "BO3", "BO5"],
  cod: ["BO1", "BO3", "BO5", "BO7", "BO9"],
};

const optionClass = (selected: boolean) =>
  `kgf-cut-sm kgf-press h-10 border-2 font-display text-xs font-bold uppercase tracking-[0.06em] ${
    selected
      ? "border-blaze bg-blaze/15 text-blaze"
      : "border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-white"
  }`;

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="kgf-eyebrow text-[var(--text-muted)] text-center">
    {children}
  </h3>
);

export function SettingsOverlay(props: SettingsOverlayProps) {
  const {
    gamePrettyName,
    gameType,
    setGameType,
    matchStage,
    setMatchStage,
    localKnifeDecider,
    setLocalKnifeDecider,
    mapPoolSize,
    setMapPoolSize,
    type,
    onBack,
    onOpenMapPool,
    onCreate,
    creating,
    disabled,
    mapPoolChanged,
    showCoinFlip,
    coinFlip,
    setCoinFlip,
  } = props;

  const isCoD = type === "cod";
  const formats = formatsByType[type ?? "fps"] ?? formatsByType.fps;

  return (
    <OverlayShell motionKey="overlay-settings" size="md">
      <h2 className="font-display text-2xl font-bold uppercase tracking-[-0.02em] text-white text-center mb-5">
        {gamePrettyName} settings
      </h2>

      <div className="space-y-4">
        <div className="space-y-3">
          <SectionHeading>Series format</SectionHeading>
          {/* One column per format on offer — four for the shooters, five
              once Call of Duty adds its BO9. */}
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${formats.length}, minmax(0, 1fr))`,
            }}
          >
            {formats.map((format) => (
              <Button
                key={format}
                onClick={() => setGameType(format)}
                className={optionClass(gameType === format)}
              >
                {format}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeading>Round</SectionHeading>
          <div className="grid grid-cols-5 gap-1.5">
            {MATCH_STAGE_OPTIONS.map((option) => (
              <Button
                key={option.id}
                onClick={() => setMatchStage(option.id)}
                className={`${optionClass(matchStage === option.id)} px-1 text-[10px] tracking-[0.02em]`}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Map pool size and knife decider are tactical-shooter concepts;
            CoD's pool size is fixed by the CDL mode pools. */}
        {!isCoD && ["BO1", "BO2"].includes(gameType) && (
          <div className="space-y-3">
            <SectionHeading>Map pool size</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              {[4, 7].map((size) => (
                <Button
                  key={size}
                  onClick={() => setMapPoolSize(size)}
                  className={optionClass(mapPoolSize === size)}
                >
                  {size} maps
                </Button>
              ))}
            </div>
          </div>
        )}

        {!isCoD && ["BO1", "BO3", "BO5"].includes(gameType) && (
          <div className="space-y-3">
            <SectionHeading>Decider side</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Team picks", value: false },
                { label: "Settled in game", value: true },
              ].map((option) => (
                <Button
                  key={option.label}
                  onClick={() => setLocalKnifeDecider(option.value)}
                  className={optionClass(localKnifeDecider === option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/*
          A BO9 spends three passes out of the same three pools, which is more
          than the rotation carries — so it falls back to the full map list.
          Worth saying, since it is the one format that ignores the defaults.
        */}
        {isCoD && gameType === "BO9" && (
          <p className="text-center text-xs text-[var(--kgf-peach)]">
            A BO9 is the BO3 veto three times over — 24 steps deciding 9 games.
            It spends more maps than the rotation carries, so it runs over the
            full map list in every mode unless you set a pool below.
          </p>
        )}

        {/* Peach marks a pool the operator has edited away from the default. */}
        <Button
          onClick={onOpenMapPool}
          variant="outline"
          className={
            mapPoolChanged
              ? "w-full mt-[20px] border-peach text-peach hover:border-peach hover:text-peach"
              : "w-full mt-[20px]"
          }
        >
          {mapPoolChanged ? "Map pool edited" : "Edit map pool"}
        </Button>

        {showCoinFlip && setCoinFlip && (
          <div className="space-y-3">
            <SectionHeading>Coin flip at start</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Off", value: false },
                { label: "On", value: true },
              ].map((option) => (
                <Button
                  key={option.label}
                  onClick={() => setCoinFlip(option.value)}
                  className={optionClass(coinFlip === option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-5 border-t border-[var(--border-default)]">
          <Button type="button" onClick={onBack} variant="secondary">
            Back
          </Button>
          <Button
            type="button"
            onClick={onCreate}
            variant="gradient"
            className="flex-1"
            disabled={creating || disabled}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
