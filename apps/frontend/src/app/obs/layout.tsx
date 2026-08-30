// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

import React, { Suspense } from "react";

/**
 * The overlay reads its lobby from the query string, which needs a Suspense
 * boundary under Next's cacheComponents prerender.
 */
export default function ObsLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
