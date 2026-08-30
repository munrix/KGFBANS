// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import VetoCard from "./veto-card";

export interface AnimatedBanCardProps {
  teamName: string;
  mapName: string;
  gameName: string;
  cardColors: {
    text: string[];
    bg: string[];
  };
  highlightElement?: string;
}

export default function AnimatedBanCard(props: AnimatedBanCardProps) {
  return <VetoCard variant="ban" label="Ban" {...props} />;
}
