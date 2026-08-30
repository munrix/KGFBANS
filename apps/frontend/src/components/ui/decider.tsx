// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React from "react";
import VetoCard from "./veto-card";

export interface AnimatedDeciderCardProps {
  mapName: string;
  gameName: string;
  cardColors: {
    text: string[];
    bg: string[];
  };
  highlightElement?: string;
}

export default function AnimatedDeciderCard(props: AnimatedDeciderCardProps) {
  return <VetoCard variant="decider" label="Decider" teamName="" {...props} />;
}
