// SPDX-FileCopyrightText: 2026 Munrix
// SPDX-License-Identifier: AGPL-3.0-only

import React, { Suspense } from "react";

/**
 * The console reads the lobby id from the route, which needs a Suspense
 * boundary under Next's cacheComponents prerender — same as the veto boards.
 */
export default function AdminControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
