// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Next's standalone output ships only the server bundle, so `public/` and
 * `.next/static/` have to be copied in beside it before it can run.
 *
 * Upstream did this with `cp -r`, which fails on Windows. This does the same
 * work through Node's fs so the build runs anywhere.
 *
 * Run from apps/frontend (see that package's "build" script).
 */

import { cp, access } from "node:fs/promises";
import { join } from "node:path";

const FRONTEND = process.cwd();
const STANDALONE = join(FRONTEND, ".next", "standalone", "apps", "frontend");

const copies = [
  [join(FRONTEND, "public"), join(STANDALONE, "public")],
  [join(FRONTEND, ".next", "static"), join(STANDALONE, ".next", "static")],
];

try {
  await access(join(FRONTEND, ".next", "standalone"));
} catch {
  console.error(
    'No standalone output found. Is `output: "standalone"` still set in next.config.ts?',
  );
  process.exit(1);
}

for (const [from, to] of copies) {
  await cp(from, to, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
