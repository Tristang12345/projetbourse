# Bloomberg Terminal Pro

Un terminal financier professionnel de type Bloomberg, construit avec **Tauri + React + TypeScript**.

---

## Architecture

```
bloomberg-terminal/
├── src/                          # Frontend React/TypeScript
│   ├── services/
│   │   ├── types.ts              # ★ Format Pivot — contrat interne unique
│   │   ├── finnhubService.ts     # API Finnhub (quotes, news, candles)
│   │   ├── polygonService.ts     # API Polygon (snapshots, OHLCV)
│   │   ├── alphaVantageService.ts# API Alpha Vantage (RSI, SMA, macro)
│   │   └── dataOrchestrator.ts   # Coordonnateur central + cache
│   ├── store/
│   │   └── useTerminalStore.ts   # État global Zustand
│   ├── hooks/
│   │   ├── useDataRefresh.ts     # Intervalles de refresh par catégorie
│   │   └── useTauriDb.ts         # Bridge Tauri ↔ SQLite
│   ├── screens/
│   │   ├── Portfolio.tsx         # Écran 1 : P&L en direct + sparklines
│   │   ├── NewsIntelligence.tsx  # Écran 2 : Flux news filtré
│   │   ├── MarketActivity.tsx    # Écran 3 : Heatmap / Tableau
│   │   ├── MacroCalendar.tsx     # Écran 4 : VIX, DXY, calendrier éco
│   │   └── Screener.tsx          # Écran 5 : Signaux RSI, MA, Volume
│   ├── components/
│   │   ├── Sparkline.tsx         # Mini-graphe SVG pur
│   │   └── StatusBar.tsx         # Barre d'état bas
│   └── utils/
│       ├── financialCalculations.ts  # ★ Calculs purs (SMA, EMA, RSI, MACD)
│       └── throttle.ts               # Token-bucket rate limiter
├── src-tauri/
│   ├── src/
│   │   ├── main.rs               # Commandes Tauri (invoke handlers)
│   │   └── db.rs                 # Couche SQLite (positions, news, snapshots)
│   └── tauri.conf.json
└── tailwind.config.js            # Thème dark Bloomberg
```

---

## Installation

### Prérequis
- **Node.js** ≥ 18
- **Rust** ≥ 1.70 (via [rustup](https://rustup.rs))
- **Tauri CLI** : `cargo install tauri-cli`

### 1. Cloner et installer

```bash
git clone <repo>
cd bloomberg-terminal
npm install
```

### 2. Configurer les clés API

Créer un fichier `.env.local` :

```env
VITE_FINNHUB_KEY=your_finnhub_api_key
VITE_POLYGON_KEY=your_polygon_api_key
VITE_ALPHAVANTAGE_KEY=your_alphavantage_api_key
```

**Obtenir les clés gratuites :**
- [Finnhub](https://finnhub.io/register) — 60 req/min
- [Polygon.io](https://polygon.io/dashboard/signup) — 5 req/min (données retardées)
- [Alpha Vantage](https://www.alphavantage.co/support/#api-key) — 5 req/min, 500/jour

### 3. Lancer en développement

```bash
npm run tauri:dev
```

### 4. Build de production (macOS .dmg)

```bash
npm run tauri:build
```

---

## Les 5 Écrans

| # | Écran | Données | Refresh |
|---|-------|---------|---------|
| 1 | **Portfolio P&L** | Prix en direct, P&L non-réalisé, sparklines | 15s |
| 2 | **News Intelligence** | Flux filtré par ticker, tags secteur, sentiment | 1min |
| 3 | **Market Activity** | Heatmap / Tableau, Volume Relatif vs avg30j | 30s |
| 4 | **Macro & Calendrier** | VIX, DXY, SPY, Gold, Oil, BTC + calendrier éco | 5min |
| 5 | **Screener Mathématique** | RSI(14), Croisements MA50/200, Breakout Volume | 10min |

---

## Fonctionnalités Clés

### Global Focus Mode
Cliquer sur n'importe quel ticker déclenche le **Global Focus Mode** :
- Une bannière apparaît en haut avec le prix en direct
- Tous les écrans sont filtrés/mis en avant sur ce ticker
- Raccourci clavier : `Esc` pour quitter le focus

### Snapshot Mode
Le bouton `SNAPSHOT` dans la barre d'état sauvegarde l'état global en SQLite :
- Positions + Prix + Données macro + Signaux screener
- Récupérables via les commandes Tauri `get_snapshots`

### Raccourcis clavier
| Raccourci | Action |
|-----------|--------|
| `⌘1` – `⌘5` | Changer d'onglet |
| `Clic ticker` | Global Focus Mode |
| `Clic focus` | Désactiver le focus |

---

## Architecture Données : Format Pivot

Tous les services normalisent leurs données vers les types définis dans `services/types.ts`.
Les écrans ne consomment **jamais** les shapes raw des APIs.

```
Finnhub API  ──┐
Polygon API  ──┼──► dataOrchestrator ──► PivotQuote / PivotNewsItem / ...
AlphaVantage ──┘         │
                    Cache en mémoire
                         │
                    Zustand Store ──► Screens
                         │
                    SQLite (Tauri) ──► Persistence
```

---

## Throttling API (Quotas gratuits)

| Service | Req/min | Req/jour | Catégorie |
|---------|---------|----------|-----------|
| Finnhub | 60 | 1440 | Quotes, News |
| Polygon | 5 | 500 | Candles, Snapshots |
| Alpha Vantage | 5 | 500 | RSI, SMA, Macro |

Le `ApiThrottler` utilise un **token-bucket** par service.
Si un service est saturé, le cache local est utilisé en fallback.

---

## Calculs Financiers Purs (`utils/financialCalculations.ts`)

| Fonction | Description |
|----------|-------------|
| `calcRSI(closes, period)` | RSI de Wilder |
| `calcSMA(data, period)` | Moyenne Mobile Simple |
| `calcEMA(data, period)` | Moyenne Mobile Exponentielle |
| `calcATR(h, l, c, period)` | Average True Range |
| `calcMACD(closes)` | MACD (12, 26, 9) |
| `detectRSISignal(rsi)` | Signal oversold/overbought |
| `detectMACrossSignal(...)` | Golden/Death Cross |
| `detectVolumeBreakout(...)` | Breakout de volume |

Toutes ces fonctions sont **pures** — sans effets de bord, testables en isolation.

---

## Base de Données SQLite

Tables créées automatiquement dans `~/Library/Application Support/Bloomberg Terminal/terminal.db` :

```sql
positions    — Ticker, PRU, Quantité, Secteur, Date d'entrée
snapshots    — Instantanés JSON horodatés
news_cache   — Articles mis en cache (auto-purge > 30 jours)
```
