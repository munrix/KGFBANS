// SPDX-FileCopyrightText: 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import Image from "next/image";
import { CDN } from "../../lib/cdn";
import { Button } from "@/components/ui/button";
import { OverlayShell } from "@/components/ui/overlay-shell";

export type GameInfo = {
  id: string;
  prettyName: string;
  type: string;
  developer: string;
  disabled?: boolean;
};

export function GameSelectionOverlay({
  games,
  onSelect,
  onCancel,
}: {
  games: GameInfo[];
  onSelect: (gameId: string) => void;
  onCancel: () => void;
}) {
  return (
    <OverlayShell motionKey="overlay-game" size="md">
      <h2 className="font-display text-2xl font-bold uppercase tracking-[-0.02em] text-white text-center mb-5">
        Choose a game
      </h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {games.map((game) => (
            <Button
              key={game.id}
              onClick={() => onSelect(game.id)}
              disabled={game.disabled}
              className="kgf-cut-sm kgf-press h-20 flex flex-col items-center justify-center gap-2 border-2 border-[var(--border-default)] bg-[var(--surface-raised)] text-white hover:border-blaze"
            >
              <Image
                src={CDN.logo(game.id)}
                alt={game.prettyName}
                width={28}
                height={28}
                className="opacity-90"
                priority={true}
              />
              <div className="text-center">
                <div className="text-sm font-medium">{game.prettyName}</div>
                <div className="text-xs opacity-60">{game.developer}</div>
              </div>
            </Button>
          ))}
        </div>

        <div className="flex pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button
            type="button"
            onClick={onCancel}
            variant="secondary"
            className="w-full"
          >
            Cancel
          </Button>
        </div>
      </div>
    </OverlayShell>
  );
}
