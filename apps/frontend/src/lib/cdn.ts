// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Asset resolution.
 *
 * Artwork ships inside the app under `public/mapban/...`, so by default every
 * path here resolves root-relative and the app is fully self-contained.
 *
 * Setting NEXT_PUBLIC_CDN_BASE re-points the same paths at a CDN without any
 * code change — useful once traffic justifies it. Leave it empty to stay local.
 */

type RuntimeEnv = {
  NEXT_PUBLIC_CDN_BASE?: string;
  NEXT_PUBLIC_CDN_LOGO?: string;
};

const getRuntimeEnv = (): RuntimeEnv => {
  if (typeof window !== "undefined") {
    const env = (window as typeof window & { __RUNTIME_ENV__?: RuntimeEnv })
      .__RUNTIME_ENV__;
    if (env) {
      return env;
    }
  }
  return {};
};

/** Empty string means "serve from this app", which is the default. */
const getBase = () => {
  const runtimeEnv = getRuntimeEnv();
  const base = runtimeEnv.NEXT_PUBLIC_CDN_BASE ?? "";
  return base.replace(/\/+$/g, "");
};

const join = (p: string) => `${getBase()}/${p.replace(/^\/+/, "")}`;

export const slugify = (s: string) =>
  s.toLowerCase().replace(/\s+/g, "").replace(/["«»]/g, "");

export const CDN = {
  get base() {
    return getBase();
  },
  raw: (path: string) => join(path),
  map: (game: string, name: string) =>
    join(`mapban/${game}/maps/${slugify(name)}.jpg`),
  mode: (game: string, name: string) =>
    join(`mapban/${game}/modes/${slugify(name)}.png`),
  logo: (game: string) => join(`mapban/${game}/logo.png`),
  coin: (result: number) => join(`mapban/coin_${result}.webm`),
  side: (game: string, side: string, variant?: "white") => {
    const base = `mapban/${game}/${side.toLowerCase()}`;
    return join(`${base}${variant === "white" ? "_white" : ""}.png`);
  },
  brand: () => {
    const runtimeEnv = getRuntimeEnv();
    const logo =
      runtimeEnv.NEXT_PUBLIC_CDN_LOGO || "brand/kgf-wordmark-white.png";
    return join(logo.replace(/\/+$/g, ""));
  },
} as const;
