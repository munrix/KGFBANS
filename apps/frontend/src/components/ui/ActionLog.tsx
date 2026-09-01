// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ActionLogProps {
  entries: string[];
  blueTeamName: string;
  redTeamName: string;
}

export function ActionLog({
  entries,
  blueTeamName,
  redTeamName,
}: ActionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries]);

  const getEntryStyle = (entry: string) => {
    if (entry.includes(blueTeamName)) {
      return "border-peach";
    } else if (entry.includes(redTeamName)) {
      return "border-lava";
    }
    return "border-transparent";
  };

  return (
    <div className="kgf-cut border border-[var(--border-default)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-hard-md)] w-full max-w-md">
      <h2 className="kgf-eyebrow mb-3 text-[var(--text-muted)]">Action log</h2>
      <ScrollArea className="h-[calc(6*2.5rem+5*0.5rem)] rounded-md">
        <div ref={scrollRef} className="space-y-2 pr-4">
          {entries.map((entry, index) => (
            <div
              key={`${entry}-${index}`}
              className={`kgf-cut-sm bg-[var(--surface-raised)] p-2 text-sm text-[var(--text-secondary)] border-l-4 ${getEntryStyle(entry)}`}
            >
              {entry}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
