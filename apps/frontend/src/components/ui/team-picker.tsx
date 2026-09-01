// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

/**
 * Pick one of the title's entered teams.
 *
 * The crest that goes on air is resolved from the team's name, so a name typed
 * by hand is a chance to lose the logo mid-broadcast. The roster is therefore
 * the default path and each option shows its own crest, which makes the right
 * row unmistakable even when two names are similar.
 *
 * Free text stays available behind "Other team", because a late substitution
 * on the day should never be a code change.
 */

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TeamCrest } from "@/components/ui/team-crest";

export function TeamPicker({
  value,
  onChange,
  teams,
  placeholder,
  label,
}: {
  value: string;
  onChange: (name: string) => void;
  /** The roster for the selected title. */
  teams: string[];
  placeholder: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  // Free text is a mode, not a value: an empty custom field still has to keep
  // the field open rather than snapping back to the roster button.
  const [custom, setCustom] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (custom) {
    return (
      <div className="flex items-center gap-3">
        <TeamCrest name={value.trim()} size={48} />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={32}
          autoFocus
          placeholder={placeholder}
          aria-label={label}
          className="kgf-cut-sm h-12 min-w-0 flex-1 border-2 border-[var(--border-default)] px-4 text-base font-bold uppercase tracking-[0.06em]"
        />
        <button
          type="button"
          onClick={() => setCustom(false)}
          className="kgf-eyebrow shrink-0 px-1 text-[10px] text-[var(--text-muted)] hover:text-white"
        >
          List
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-3">
      <TeamCrest name={value.trim()} size={48} />
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="kgf-cut-sm kgf-press flex h-12 min-w-0 flex-1 items-center justify-between gap-2 border-2 border-[var(--border-default)] bg-[var(--surface-raised)] px-4 text-left hover:border-[var(--border-strong)]"
      >
        <span
          className={`truncate font-display text-base font-bold uppercase tracking-[0.06em] ${
            value ? "text-white" : "text-[var(--text-muted)]"
          }`}
        >
          {value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          // Lifted above the fields below it, which would otherwise take the
          // click meant for the last row of the list.
          className="kgf-cut-sm absolute left-[60px] right-0 top-full z-30 mt-1.5 overflow-hidden border-2 border-[var(--border-strong)] bg-[var(--surface-card)] shadow-[var(--shadow-hard-md)]"
        >
          {teams.map((team) => (
            <button
              key={team}
              type="button"
              role="option"
              aria-selected={team === value}
              onClick={() => {
                onChange(team);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-raised)] ${
                team === value ? "bg-blaze/15" : ""
              }`}
            >
              <TeamCrest name={team} size={32} />
              <span className="truncate font-display text-sm font-bold uppercase tracking-[0.04em] text-white">
                {team}
              </span>
            </button>
          ))}

          {teams.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-[var(--text-muted)]">
              No teams entered for this title.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setCustom(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 border-t border-[var(--border-default)] px-3 py-2.5 text-left hover:bg-[var(--surface-raised)]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center text-[var(--text-muted)]">
              <Pencil className="h-4 w-4" />
            </span>
            <span className="kgf-eyebrow text-[11px] text-[var(--text-secondary)]">
              Other team
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default TeamPicker;
