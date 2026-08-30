// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Fetches map pool data from the backend API
 * @param backendUrl The backend API URL
 * @returns Promise containing map pool data and map names list
 */
export async function fetchMapPool(backendUrl: string) {
  try {
    const response = await fetch(
      `${backendUrl.endsWith("/") ? backendUrl : backendUrl + "/"}api/mapPool`,
    );
    const data: {
      mapPool: {
        fps: Record<string, string[]>;
        cod: Record<string, string[]>;
      };
      mapNamesLists: {
        fps: Record<string, string[]>;
        cod: Record<string, string[]>;
      };
    } = await response.json();

    // FPS pools are keyed by game (r6, valorant); CoD pools by mode
    // (hardpoint, snd, overload). Both share one flat lookup.
    const mapPool: Record<string, string[]> = {
      ...data.mapPool.fps,
      ...data.mapPool.cod,
    };
    const mapNamesLists: Record<string, string[]> = {
      ...data.mapNamesLists.fps,
      ...data.mapNamesLists.cod,
    };

    return {
      mapPool,
      mapNamesLists,
      success: true,
    };
  } catch (error) {
    console.error("Error fetching map pool:", error);
    return {
      mapPool: {},
      mapNamesLists: {},
      success: false,
      error,
    };
  }
}
