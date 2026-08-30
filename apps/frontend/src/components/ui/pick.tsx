// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import VetoCard from "./veto-card";

export interface AnimatedPickCardProps {
  teamName: string;
  mapName: string;
  gameName: string;
  side: string;
  sideTeamName: string;
  cardColors: {
    text: string[];
    bg: string[];
  };
  highlightElement?: string;
}

export default function AnimatedPickCard({
  sideTeamName,
  teamName,
  ...rest
}: AnimatedPickCardProps) {
  /*
   * The band names the team that PICKED the map — that is the headline a
   * viewer reads off the card. `teamName` is the picker (the backend credits
   * the map to them); `sideTeamName` is whoever chose the side, which is what
   * the side marker beside the name represents.
   */
  return (
    <VetoCard
      variant="pick"
      label="Pick"
      teamName={teamName || sideTeamName}
      {...rest}
    />
  );
}
