// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * Cache Components (partial prerendering) is deliberately off.
   *
   * Every route here is a live socket board — there is no static shell worth
   * serving ahead of the data. Worse, with it on the `[lobbyId]` routes built
   * as prerendered shells and the client read the route param before request
   * time resolved it, so `useParams()` handed back the internal sentinel
   * (`%%drp:lobbyId:...%%`) and every lobby reported itself as not found.
   * That only ever showed in a production build, never in `next dev`.
   */
  output: "standalone",
  images: {
    unoptimized: false,
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    optimizePackageImports: ['framer-motion', 'lucide-react'],
  },
};

export default nextConfig;
