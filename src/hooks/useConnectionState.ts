/**
 * useConnectionState — Détecte si l'app est en ligne ou hors ligne.
 */

import { useState, useEffect } from "react";

export type ConnectionStatus = "online" | "offline";

export const useConnectionState = () => {
  const [status, setStatus] = useState<ConnectionStatus>(
    navigator.onLine ? "online" : "offline",
  );

  useEffect(() => {
    const onOnline  = () => setStatus("online");
    const onOffline = () => setStatus("offline");
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { status };
};
