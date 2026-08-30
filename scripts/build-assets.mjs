// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Generates branded placeholder artwork for every map in the pools, so the app
 * looks finished before real screenshots are sourced.
 *
 * Real art drops in over the top: replace any file in
 * apps/frontend/public/mapban/<game>/maps/<slug>.jpg and it is picked up with
 * no code change. Re-running this script only writes files that are missing,
 * so your real art is never overwritten (pass --force to regenerate).
 *
 *   node scripts/build-assets.mjs [--force]
 *
 * Keep these lists in sync with apps/backend/src/games/{fps-games,cod}.ts.
 */

import sharp from "sharp";
import { mkdir, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "apps", "frontend", "public", "mapban");
const FORCE = process.argv.includes("--force");

// Kurdistan Gaming Festival palette (Brand Guidelines/Colors.txt)
const KGF = {
  flame: "#E94609",
  burnt: "#BC1A01",
  peach: "#EF9A6B",
  black: "#0D0D0F",
  ink: "#12161A",
  slate: "#262D34",
};

const MAPS = {
  r6: [
    "Bank", "Border", "Chalet", "Clubhouse", "Coastline", "Consulate",
    "Emerald Plains", "Fortress", "Kafe Dostoyevsky", "Kanal", "Lair",
    "Nighthaven Labs", "Oregon", "Outback", "Skyscraper", "Theme Park", "Villa",
  ],
  valorant: [
    "Abyss", "Ascent", "Bind", "Breeze", "Corrode", "District", "Drift",
    "Fracture", "Glitch", "Haven", "Icebox", "Kasbah", "Lotus", "Pearl",
    "Piazza", "Split", "Sunset",
  ],
  bo7: ["Blackheart", "Colossus", "Den", "Exposure", "Raid", "Scar"],
};

// Mirrors slugify() in apps/frontend/src/lib/cdn.ts
const slugify = (s) =>
  s.toLowerCase().replace(/\s+/g, "").replace(/["«»]/g, "");

/** Stable hash so a given map always gets the same artwork. */
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const W = 800;
const H = 600;

/**
 * An angular, KGF-flavoured abstract tile. The board draws the map name on
 * top, so the art stays deliberately typographic-free.
 */
const tileSvg = (game, name) => {
  const h = hash(`${game}:${name}`);
  const angle = 12 + (h % 26); // slant of the main diagonal band
  const accent = [KGF.flame, KGF.burnt, KGF.peach][h % 3];
  const shift = h % 200;
  const bandY = 180 + (h % 220);
  const opacity = 0.14 + ((h >> 3) % 10) / 100;

  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${KGF.ink}"/>
      <stop offset="60%" stop-color="${KGF.black}"/>
      <stop offset="100%" stop-color="${KGF.slate}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.15"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- angular bands echoing the KGF hexagon cuts -->
  <g transform="rotate(${angle} ${W / 2} ${H / 2})">
    <rect x="${-200 + shift}" y="${bandY}" width="${W + 400}" height="46" fill="url(#accent)"/>
    <rect x="${-200 + shift}" y="${bandY + 78}" width="${W + 400}" height="14" fill="${accent}" opacity="0.5"/>
    <rect x="${-200 + shift}" y="${bandY - 120}" width="${W + 400}" height="8" fill="${KGF.peach}" opacity="0.35"/>
  </g>

  <!-- corner cut, echoing the large cut token -->
  <path d="M0,0 L120,0 L0,120 Z" fill="${accent}" opacity="0.5"/>
  <path d="M${W},${H} L${W - 160},${H} L${W},${H - 160} Z" fill="${accent}" opacity="0.3"/>

  <!-- faint hexagon from the KGF mark -->
  <g opacity="${opacity}" transform="translate(${W / 2} ${H / 2}) scale(${1.6 + (h % 5) / 10})">
    <polygon points="0,-110 95,-55 95,55 0,110 -95,55 -95,-55"
             fill="none" stroke="${KGF.peach}" stroke-width="10"/>
  </g>

  <!-- vignette so the overlaid map name stays legible -->
  <rect width="${W}" height="${H}" fill="${KGF.black}" opacity="0.28"/>
</svg>`);
};

const exists = async (p) => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

/** Game badge for the picker: the KGF hexagon with a short monogram. */
const logoSvg = (label) =>
  Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <g transform="translate(128 128)">
    <polygon points="0,-112 97,-56 97,56 0,112 -97,56 -97,-56"
             fill="none" stroke="${KGF.flame}" stroke-width="10"/>
    <polygon points="0,-84 73,-42 73,42 0,84 -73,42 -73,-42"
             fill="${KGF.flame}" opacity="0.12"/>
    <text x="0" y="18" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="bold"
          fill="${KGF.peach}">${label}</text>
  </g>
</svg>`);

/** Attack / defense markers used on pick cards. */
const sideSvg = (side, white) => {
  const color = white ? "#FFFFFF" : KGF.flame;
  const glyph =
    side === "t"
      ? // attack: forward chevrons
        `<path d="M-34,-40 L6,0 L-34,40 L-14,40 L26,0 L-14,-40 Z" fill="${color}"/>`
      : // defense: shield
        `<path d="M0,-44 L38,-28 L38,10 C38,34 20,48 0,56 C-20,48 -38,34 -38,10 L-38,-28 Z"
              fill="none" stroke="${color}" stroke-width="12" stroke-linejoin="round"/>`;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <g transform="translate(64 64)">${glyph}</g>
</svg>`);
};

/** Mode icons for Call of Duty cards. */
const modeSvg = (label) =>
  Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <g transform="translate(96 96)">
    <polygon points="0,-70 61,-35 61,35 0,70 -61,35 -61,-35"
             fill="${KGF.black}" stroke="${KGF.flame}" stroke-width="7"/>
    <text x="0" y="14" text-anchor="middle"
          font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="bold"
          fill="${KGF.peach}">${label}</text>
  </g>
</svg>`);

let written = 0;
let skipped = 0;

const emit = async (file, buf, format) => {
  if (!FORCE && (await exists(file))) {
    skipped++;
    return;
  }
  await mkdir(dirname(file), { recursive: true });
  const pipeline = sharp(buf);
  await (format === "jpg"
    ? pipeline.jpeg({ quality: 82, mozjpeg: true })
    : pipeline.png()
  ).toFile(file);
  written++;
};

// Map art
for (const [game, names] of Object.entries(MAPS)) {
  for (const name of names) {
    await emit(
      join(OUT, game, "maps", `${slugify(name)}.jpg`),
      tileSvg(game, name),
      "jpg",
    );
  }
}

// Game badges
for (const [game, label] of Object.entries({
  r6: "R6",
  valorant: "VAL",
  bo7: "BO7",
})) {
  await emit(join(OUT, game, "logo.png"), logoSvg(label), "png");
}

// Side markers (every game uses the same pair)
for (const game of Object.keys(MAPS)) {
  for (const side of ["t", "ct"]) {
    await emit(join(OUT, game, `${side}.png`), sideSvg(side, false), "png");
    await emit(
      join(OUT, game, `${side}_white.png`),
      sideSvg(side, true),
      "png",
    );
  }
}

// Call of Duty mode icons
for (const [mode, label] of Object.entries({
  hardpoint: "HP",
  "search&destroy": "S&amp;D",
  overload: "OVL",
})) {
  await emit(join(OUT, "bo7", "modes", `${mode}.png`), modeSvg(label), "png");
}

console.log(
  `assets: ${written} written, ${skipped} left alone (use --force to regenerate)`,
);
