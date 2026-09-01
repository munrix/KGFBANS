// SPDX-FileCopyrightText: 2024, 2025 CyberSport Masters <git@csmpro.ru>
// SPDX-License-Identifier: AGPL-3.0-only

"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { io } from "socket.io-client";
import { resolveBackendUrl } from "@/lib/backend-url";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LobbyPage() {
  const { lobbyId } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const [, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const backendUrl = resolveBackendUrl();

  useEffect(() => {
    const newSocket = io(backendUrl);

    newSocket.on("connect", () => {
      console.log("Connected to Socket.IO server");
      if (lobbyId) {
        // Request game type for this lobby
        newSocket.emit("getLobbyGameCategory", lobbyId);
        console.log(`Requested game type for lobby ${lobbyId}`);
      }
    });

    newSocket.on("lobbyGameCategory", (gameCategory: string) => {
      setIsLoading(false);
      if (gameCategory === "cod") {
        router.push(`/cod/${lobbyId}`);
      } else {
        router.push(`/fps/${lobbyId}`);
      }
    });

    newSocket.on("lobbyNotFound", () => {
      setIsLoading(false);
      setIsError(true);
    });

    return () => {
      newSocket.disconnect();
    };
  }, [lobbyId, router, backendUrl]);

  const handleBackClick = () => {
    router.push("/");
  };

  const handleCopyCodeClick = () => {
    navigator.clipboard.writeText(lobbyId as string);
    toast({
      title: "Code copied",
      description: "Lobby code copied to clipboard",
    });
  };

  if (isError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md p-6">
          <h1 className="mb-4 text-2xl font-bold">Lobby not found</h1>
          <p className="mb-6">
            Lobby {lobbyId} does not exist or has been deleted.
          </p>
          <Button onClick={handleBackClick}>Go back</Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            className="flex items-center"
            onClick={handleBackClick}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            variant="ghost"
            className="flex items-center"
            onClick={handleCopyCodeClick}
          >
            <span className="mr-2">{lobbyId}</span>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-lg">Loading...</p>
        </div>
      </Card>
    </main>
  );
}
