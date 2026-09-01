// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Conditions real artwork that has been dropped into `public/mapban`.
 *
 * Source art arrives at whatever size and format it was uploaded in — image
 * hosts hand back multi-megabyte PNGs named `.jpg`, and team logos come as
 * whatever crop the team had lying around. An OBS browser source reloads its
 * whole page mid-broadcast, so weight here is not cosmetic.
 *
 * Map art is re-encoded to a real JPEG no wider than 1600px. Team logos are
 * trimmed of their border and squared up, so the overlay can lay every crest
 * out on one grid: a logo that carries its own background is padded out with
 * that same colour and reads as a badge, while one with transparency is left
 * transparent so it sits directly on the surface.
 *
 *   node scripts/normalize-assets.mjs [--force]
 *
 * Idempotent: art already within budget is left alone unless --force.
 */

import sharp from "sharp";
import { readdir, stat, rename, unlink } from "node:fs/promises";
import { dirname, join, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "apps", "frontend", "public");
const MAPBAN = join(PUBLIC, "mapban");
const FORCE = process.argv.includes("--force");

/** Wide enough for a full-bleed 1080p overlay panel, and no wider. */
const MAP_WIDTH = 1600;
const MAP_QUALITY = 82;
/** Logos never render larger than a few hundred px; 512 covers retina. */
const LOGO_SIZE = 512;

const kb = (n) => `${Math.round(n / 1024)}kB`;

const listFiles = async (dir) => {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
};

/**
 * The colour to pad a logo out to a square with.
 *
 * Taken from the corners of the art, which is where its own background lives —
 * averaging the whole image instead would read a white crest with heavy black
 * lettering as dark, and pad it out with bars that fight the logo.
 *
 * The four corners are averaged so a lightly textured backing still resolves to
 * one flat colour, and the result is used as-is rather than snapped to black or
 * white, which is what makes the padding invisible.
 */
const backdropOf = async (buf) => {
  const N = 32;
  const { data } = await sharp(buf)
    .resize(N, N, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const at = (x, y) => {
    const i = (y * N + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [at(0, 0), at(N - 1, 0), at(0, N - 1), at(N - 1, N - 1)];
  const mean = (i) =>
    Math.round(corners.reduce((sum, c) => sum + c[i], 0) / corners.length);

  return { r: mean(0), g: mean(1), b: mean(2), alpha: 1 };
};

const normalizeMaps = async () => {
  for (const game of await listFiles(MAPBAN)) {
    const dir = join(MAPBAN, game, "maps");
    for (const file of await listFiles(dir)) {
      const path = join(dir, file);
      const before = (await stat(path)).size;
      const meta = await sharp(path).metadata();

      const oversized = meta.width > MAP_WIDTH;
      const misencoded = meta.format !== "jpeg";
      if (!FORCE && !oversized && !misencoded && before < 400 * 1024) continue;

      const tmp = join(dir, `.tmp-${basename(file, extname(file))}.jpg`);
      await sharp(path)
        .resize({ width: MAP_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: MAP_QUALITY, mozjpeg: true })
        .toFile(tmp);
      await unlink(path);
      await rename(tmp, path);

      const after = (await stat(path)).size;
      console.log(
        `map   ${game}/${file.padEnd(20)} ${meta.format}->jpeg  ${kb(before)} -> ${kb(after)}`,
      );
    }
  }
};

const normalizeLogos = async () => {
  const dir = join(MAPBAN, "teams");
  for (const file of await listFiles(dir)) {
    if (file.startsWith(".")) continue;
    const path = join(dir, file);
    const before = (await stat(path)).size;
    const meta = await sharp(path).metadata();
    if (!FORCE && meta.width === LOGO_SIZE && meta.height === LOGO_SIZE) {
      continue;
    }

    // Trim first: most crests arrive matted onto a border that would
    // otherwise dominate the square.
    let trimmed;
    try {
      trimmed = await sharp(path).trim({ threshold: 12 }).png().toBuffer();
    } catch {
      trimmed = await sharp(path).png().toBuffer();
    }

    const background = meta.hasAlpha
      ? { r: 0, g: 0, b: 0, alpha: 0 }
      : await backdropOf(trimmed);

    const tmp = join(dir, `.tmp-${file}`);
    await sharp(trimmed)
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: "contain", background })
      .flatten(meta.hasAlpha ? false : { background })
      .png({ compressionLevel: 9 })
      .toFile(tmp);
    await unlink(path);
    await rename(tmp, path);

    const after = (await stat(path)).size;
    console.log(
      `logo  ${file.padEnd(30)} ${meta.width}x${meta.height} -> ${LOGO_SIZE}²  ${kb(before)} -> ${kb(after)}  ${meta.hasAlpha ? "transparent" : "badged"}`,
    );
  }
};

/**
 * Brand marks arrive from the guidelines at print resolution. Nothing renders
 * one past a few hundred px, so they are capped — transparency intact, since
 * every one of them is laid over a dark surface.
 */
const BRAND_WIDTH = 1024;

const normalizeBrand = async () => {
  const dir = join(PUBLIC, "brand");
  for (const file of await listFiles(dir)) {
    if (!file.endsWith(".png") || file.startsWith(".")) continue;
    const path = join(dir, file);
    const meta = await sharp(path).metadata();
    if (meta.width <= BRAND_WIDTH && !FORCE) continue;

    const before = (await stat(path)).size;
    const tmp = join(dir, `.tmp-${file}`);
    await sharp(path)
      .resize({ width: BRAND_WIDTH, withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(tmp);
    await unlink(path);
    await rename(tmp, path);

    console.log(
      `brand ${file.padEnd(30)} ${meta.width}px -> ${BRAND_WIDTH}px  ${kb(before)} -> ${kb((await stat(path)).size)}`,
    );
  }
};

await normalizeMaps();
await normalizeLogos();
await normalizeBrand();
