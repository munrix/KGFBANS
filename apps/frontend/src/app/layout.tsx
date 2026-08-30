// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import localFont from "next/font/local";
import "./globals.css";
import React from "react";

// Aeonik is the Kurdistan Gaming Festival brand face (Brand Guidelines/Font).
const aeonik = localFont({
  src: [
    { path: "./fonts/Aeonik-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Aeonik-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-aeonik",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Munrix Bans",
  description: "Map veto and broadcast overlays for Kurdistan Gaming Festival",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${aeonik.variable} ${geistMono.variable} antialiased`}>
        <RuntimeEnvLoader />
        <Toaster />
        {children}
      </body>
    </html>
  );
}

function RuntimeEnvLoader() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (async () => {
            try {
              const res = await fetch('/api/runtime-env');
              const env = await res.json();
              window.__RUNTIME_ENV__ = env;
            } catch (e) {
              // The endpoint lives on the backend and is only proxied in
              // production; falling back to local assets is the right default.
              window.__RUNTIME_ENV__ = {
                NEXT_PUBLIC_CDN_BASE: "",
                NEXT_PUBLIC_CDN_LOGO: "brand/kgf-wordmark-white.png",
              };
            }
          })();
        `,
      }}
    />
  );
}
