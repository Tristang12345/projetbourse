/**
 * useApiKeys — Chargement des clés API.
 * Tauri : depuis SQLite local via invoke().
 * Browser/dev : fallback sur VITE_* de .env.local.
 */

import { useState, useEffect, useCallback } from "react";

export interface ApiKeys {
  finnhub:      string;
  polygon:      string;
  alphavantage: string;
}

let keysCache: ApiKeys | null = null;

const isTauriEnv = (): boolean =>
  typeof window !== "undefined" && "__TAURI__" in window;

export const loadApiKeys = async (): Promise<ApiKeys> => {
  if (keysCache) return keysCache;

  if (isTauriEnv()) {
    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      const keys = await invoke<ApiKeys>("get_api_keys");
      keysCache = {
        finnhub:      keys.finnhub      || (import.meta.env.VITE_FINNHUB_KEY      ?? ""),
        polygon:      keys.polygon      || (import.meta.env.VITE_POLYGON_KEY      ?? ""),
        alphavantage: keys.alphavantage || (import.meta.env.VITE_ALPHAVANTAGE_KEY ?? ""),
      };
    } catch {
      keysCache = {
        finnhub:      import.meta.env.VITE_FINNHUB_KEY      ?? "",
        polygon:      import.meta.env.VITE_POLYGON_KEY      ?? "",
        alphavantage: import.meta.env.VITE_ALPHAVANTAGE_KEY ?? "",
      };
    }
  } else {
    keysCache = {
      finnhub:      import.meta.env.VITE_FINNHUB_KEY      ?? "",
      polygon:      import.meta.env.VITE_POLYGON_KEY      ?? "",
      alphavantage: import.meta.env.VITE_ALPHAVANTAGE_KEY ?? "",
    };
  }

  return keysCache;
};

export const invalidateKeysCache = () => { keysCache = null; };

export const useApiKeys = () => {
  const [keys,    setKeys]    = useState<ApiKeys>({ finnhub: "", polygon: "", alphavantage: "" });
  const [loading, setLoading] = useState(true);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    loadApiKeys()
      .then(setKeys)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const saveKeys = useCallback(async (newKeys: ApiKeys) => {
    setError(null);
    if (!isTauriEnv()) {
      setError("Sauvegarde sécurisée disponible uniquement dans l'app compilée. Utilisez .env.local en dev.");
      return;
    }
    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      await invoke("save_api_keys", { keys: newKeys });
      invalidateKeysCache();
      keysCache = newKeys;
      setKeys(newKeys);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(String(e)); }
  }, []);

  const clearKeys = useCallback(async () => {
    await saveKeys({ finnhub: "", polygon: "", alphavantage: "" });
  }, [saveKeys]);

  return { keys, setKeys, loading, saved, error, saveKeys, clearKeys };
};
