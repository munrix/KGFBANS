// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Where in the bracket a match sits.
 *
 * Nothing about the veto changes with it — this is a broadcast label. The
 * overlays lead with it so a viewer joining mid-series knows what is at stake,
 * and the group stage deliberately has no label: most matches are group
 * matches, and captioning every one of them "Group Stage" would just be noise
 * where the round actually matters.
 *
 * Mirrors MATCH_STAGE_LABELS in apps/backend/src/utils/types.ts.
 */

export const MATCH_STAGES = [
  "group",
  "quarterfinal",
  "semifinal",
  "thirdplace",
  "final",
] as const;

export type MatchStage = (typeof MATCH_STAGES)[number];

/** What the desk picks from. */
export const MATCH_STAGE_OPTIONS: { id: MatchStage; label: string }[] = [
  { id: "group", label: "Group" },
  { id: "quarterfinal", label: "Quarter" },
  { id: "semifinal", label: "Semi-Final" },
  { id: "thirdplace", label: "Third Place" },
  { id: "final", label: "Grand Final" },
];

/** What goes on air. Empty for the group stage, which stays uncaptioned. */
export const MATCH_STAGE_LABELS: Record<MatchStage, string> = {
  group: "",
  quarterfinal: "Quarter-Final",
  semifinal: "Semi-Final",
  thirdplace: "Third Place",
  final: "Grand Final",
};

export const stageLabel = (stage: string | null | undefined) =>
  MATCH_STAGE_LABELS[(stage ?? "group") as MatchStage] ?? "";

/** True for the rounds worth giving the overlay's accent treatment. */
export const isHeadlineStage = (stage: string | null | undefined) =>
  stage === "final" || stage === "semifinal" || stage === "thirdplace";
