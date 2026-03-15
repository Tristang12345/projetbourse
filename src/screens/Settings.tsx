/**
 * ============================================================
 * SCREEN 6 — SETTINGS / API KEYS
 * Saisie sécurisée des clés API stockées via Tauri (SQLite local).
 * ============================================================
 */

import React, { useState } from "react";
import { Key, Save, Trash2, CheckCircle, AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react";
import { useApiKeys } from "../hooks/useApiKeys";
import type { ApiKeys } from "../hooks/useApiKeys";

const PROVIDERS: {
  key: keyof ApiKeys; label: string; description: string;
  url: string; quota: string; delayed?: boolean;
}[] = [
  {
    key: "finnhub", label: "Finnhub",
    description: "Cours temps réel US, actualités, profils, calendrier économique.",
    url: "https://finnhub.io/register", quota: "60 req/min — gratuit",
  },
  {
    key: "polygon", label: "Polygon.io",
    description: "Données OHLCV journalières US.",
    url: "https://polygon.io/dashboard/signup", quota: "5 req/min — gratuit",
    delayed: true,
  },
  {
    key: "alphavantage", label: "Alpha Vantage",
    description: "Indicateurs techniques, données macro, news EU.",
    url: "https://www.alphavantage.co/support/#api-key", quota: "5 req/min, 500/jour — gratuit",
  },
];

const KeyField: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  description: string; url: string; quota: string; delayed?: boolean;
}> = ({ label, value, onChange, description, url, quota, delayed }) => {
  const [visible, setVisible] = useState(false);
  const hasValue = value.trim().length > 0;

  return (
    <div className="border border-terminal-border rounded-lg p-4 space-y-2 bg-terminal-surface">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key size={13} className="text-terminal-accent" />
          <span className="text-sm font-mono font-bold text-terminal-text">{label}</span>
          {delayed && (
            <span className="text-2xs font-mono px-1.5 py-0.5 rounded bg-warn/15 text-warn border border-warn/30">
              DELAYED 15min
            </span>
          )}
        </div>
        <div className={`w-2 h-2 rounded-full ${hasValue ? "bg-up" : "bg-terminal-muted"}`} />
      </div>
      <p className="text-2xs font-mono text-terminal-dim">{description}</p>
      <p className="text-2xs font-mono text-terminal-dim/60">{quota}</p>
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Collez votre clé API ici…"
            className="w-full bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm font-mono text-terminal-text focus:outline-none focus:border-terminal-accent pr-9"
          />
          <button type="button" onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-dim hover:text-terminal-text">
            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-2xs font-mono text-terminal-accent hover:underline shrink-0">
          Obtenir <ExternalLink size={10} />
        </a>
      </div>
    </div>
  );
};

export const Settings: React.FC = () => {
  const { keys, setKeys, loading, saved, error, saveKeys, clearKeys } = useApiKeys();
  const isTauri = typeof window !== "undefined" && "__TAURI__" in window;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-terminal-dim font-mono text-sm">
        Chargement…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-sm font-mono font-bold text-terminal-accent tracking-widest uppercase mb-1">
          Paramètres — Clés API
        </h2>
        <p className="text-2xs font-mono text-terminal-dim leading-relaxed">
          Vos clés sont stockées localement dans la base SQLite de l'application, jamais dans le code distribué.
        </p>
      </div>

      {!isTauri && (
        <div className="mb-4 flex gap-2 items-start p-3 rounded border border-warn/40 bg-warn/10">
          <AlertCircle size={13} className="text-warn shrink-0 mt-0.5" />
          <p className="text-2xs font-mono text-warn">
            Mode développement — utilisez <code>.env.local</code> pour les clés. La sauvegarde sécurisée est disponible dans l'app compilée.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {PROVIDERS.map((p) => (
          <KeyField
            key={p.key} label={p.label} description={p.description}
            url={p.url} quota={p.quota} delayed={p.delayed}
            value={keys[p.key]}
            onChange={(v) => setKeys((k) => ({ ...k, [p.key]: v }))}
          />
        ))}
      </div>

      {error && (
        <div className="mt-4 flex gap-2 items-start p-3 rounded border border-down/40 bg-down/10">
          <AlertCircle size={13} className="text-down shrink-0 mt-0.5" />
          <p className="text-2xs font-mono text-down">{error}</p>
        </div>
      )}
      {saved && (
        <div className="mt-4 flex gap-2 items-center p-3 rounded border border-up/40 bg-up/10">
          <CheckCircle size={13} className="text-up" />
          <p className="text-2xs font-mono text-up">Clés sauvegardées avec succès.</p>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button onClick={() => saveKeys(keys)} disabled={!isTauri}
          className="flex items-center gap-2 px-4 py-2 bg-terminal-accent/10 border border-terminal-accent rounded text-sm font-mono text-terminal-accent hover:bg-terminal-accent/20 transition-colors disabled:opacity-40">
          <Save size={13} /> Sauvegarder
        </button>
        <button onClick={clearKeys} disabled={!isTauri}
          className="flex items-center gap-2 px-4 py-2 border border-terminal-border rounded text-sm font-mono text-terminal-dim hover:text-down hover:border-down transition-colors disabled:opacity-40">
          <Trash2 size={13} /> Effacer
        </button>
      </div>

      <div className="mt-8 p-3 rounded border border-terminal-border/50 bg-terminal-surface">
        <p className="text-2xs font-mono text-terminal-dim leading-relaxed">
          <span className="text-terminal-text font-semibold">Sans clés API</span> — l'application
          fonctionne en mode démonstration avec des données simulées.
        </p>
      </div>
    </div>
  );
};
