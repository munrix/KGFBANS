// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { OverlayShell } from "@/components/ui/overlay-shell";

export type SettingsOverlayProps = {
  gamePrettyName?: string;
  gameType: string;
  setGameType: (t: string) => void;
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

// Call of Duty runs the CDL formats; the tactical shooters run BO1/2/3/5.
const formatsByType: Record<string, string[]> = {
  fps: ["BO1", "BO2", "BO3", "BO5"],
  cod: ["BO1", "BO3", "BO5", "BO7"],
};

const optionClass = (selected: boolean) =>
  `h-9 rounded-2xl font-medium transition-all duration-200 ${
    selected
      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 border-0"
  }`;

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-sm font-medium text-neutral-600 dark:text-neutral-400 text-center uppercase tracking-wider">
    {children}
  </h3>
);

export function SettingsOverlay(props: SettingsOverlayProps) {
  const {
    gamePrettyName,
    gameType,
    setGameType,
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
      <h2 className="text-xl font-light text-neutral-900 dark:text-neutral-100 text-center mb-5">
        {gamePrettyName} settings
      </h2>

      <div className="space-y-4">
        <div className="space-y-3">
          <SectionHeading>Series format</SectionHeading>
          <div className="grid grid-cols-4 gap-2">
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
            <SectionHeading>Decider</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Off", value: false },
                { label: "On", value: true },
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

        <Button
          onClick={onOpenMapPool}
          className={
            mapPoolChanged
              ? "w-full h-10 mt-[20px] rounded-2xl font-medium transition-all duration-200 bg-neutral-50 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-600 border-0"
              : "w-full h-10 mt-[20px] rounded-2xl font-medium transition-all duration-200 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 border-0"
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

        <div className="flex gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button
            type="button"
            onClick={onBack}
            className="h-10 px-6 rounded-2xl font-medium bg-neutral-100 dark:bg-red-400 text-neutral-600 dark:text-neutral-900 hover:bg-red-200 dark:hover:bg-red-300 border-0 transition-all duration-200"
          >
            Back
          </Button>
          <Button
            type="button"
            onClick={onCreate}
            className={`flex-1 h-10 rounded-2xl font-medium transition-all duration-200 ${
              creating
                ? "bg-neutral-300 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 cursor-not-allowed"
                : "bg-neutral-900 dark:bg-green-300 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-green-200"
            }`}
            disabled={creating || disabled}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
