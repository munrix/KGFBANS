// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Where the veto server lives.
 *
 * Three deployments, one rule:
 *
 * - Split hosting (frontend on Vercel, server on its own box) sets
 *   `NEXT_PUBLIC_BACKEND_URL` to the server's public origin. Next inlines
 *   `NEXT_PUBLIC_*` at build time, so it has to be set before the build runs,
 *   not just at runtime.
 * - The bundled `deploy/docker-compose.yml` puts Caddy in front of both, so
 *   the server answers on this same origin and the default of "/" is right.
 * - `yarn dev` runs the server on 4000 alongside Next on 3000.
 *
 * Every page resolves it through here rather than inlining the check, because
 * a page that quietly kept assuming same-origin would connect to nothing on a
 * split deployment and fail only once someone opened a lobby.
 */
/**
 * Always returns a value ending in "/".
 *
 * Callers build paths by plain concatenation — `${backendUrl}api/lobbies` —
 * so an origin pasted into the dashboard without its trailing slash would
 * silently produce `https://hostapi/lobbies`. Normalising here means the env
 * var can be written either way.
 */
export const resolveBackendUrl = () => {
  const configured =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (process.env.NODE_ENV === "development" ? "http://localhost:4000/" : "/");
  return configured.endsWith("/") ? configured : `${configured}/`;
};
