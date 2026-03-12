# ⬛ TERMINAL — Bloomberg-like Financial Dashboard

> A professional-grade financial terminal for macOS built with **Tauri + React + TypeScript**.
> Dark mode, real-time P&L, news intelligence, market heatmap, macro calendar and a mathematical screener.

---

## Screenshots (Dark Mode)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ T TERMINAL v1.0  ◈ PORTFOLIO [1]  ◉ NEWS INTEL [2]  ◧ MARKET [3]        │
│ ◆ MACRO [4]  ◌ SCREENER [5]                    FOCUS: AAPL  DAY: +$842  │
├──────────────────────────────────────────────────────────────────────────┤
│ SPY 512.6 +0.29%  │  QQQ 441.3 +0.51%  │  AAPL 189.5 +1.2%  │ NVDA ... │
├──────────────────────────────────────────────────────────────────────────┤
│  PORTFOLIO VALUE    TOTAL P&L      DAY P&L       COST BASIS              │
│  $312,450.00       +$28,920 +9.2%  +$842 +0.27%  $283,530.00            │
│                                                                           │
│  TICKER  SECTOR       QTY  COST    PRICE   VALUE     DAY P&L  TOTAL P&L  │
│  AAPL    Technology   50   $165    $189.5  $9,475  +$32  🟢    +$24.5%  │
│  NVDA    Technology   20   $485    $875    $17,500 +$182 🟢    +80.4%   │
│  ...                                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

```
bloomberg-terminal/
├── src/
│   ├── types/index.ts          # All domain types (single source of truth)
│   ├── lib/
│   │   └── financialCalc.ts    # Pure financial functions (zero UI deps)
│   ├── services/
│   │   ├── apiService.ts       # Rate-limited pivot-format data layer
│   │   └── mockData.ts         # Realistic demo data with random walk
│   ├── store/
│   │   └── index.ts            # Zustand centralized state + selectors
│   ├── components/
│   │   ├── Sparkline.tsx       # Recharts sparkline for P&L trends
│   │   ├── Heatmap.tsx         # Color-coded market heatmap
│   │   ├── StatusBar.tsx       # Bottom bar: market status + snapshot
│   │   └── TickerTape.tsx      # Scrolling ticker ribbon
│   ├── screens/
│   │   ├── Portfolio.tsx       # Screen 1: P&L + sector breakdown
│   │   ├── NewsIntelligence.tsx# Screen 2: Filtered news + sentiment
│   │   ├── MarketActivity.tsx  # Screen 3: Table/Heatmap toggle
│   │   ├── MacroCalendar.tsx   # Screen 4: VIX/DXY + econ calendar
│   │   └── Screener.tsx        # Screen 5: RSI/SMA/Volume signals
│   ├── App.tsx                 # Tab navigation + global focus
│   └── main.tsx
└── src-tauri/
    └── src/main.rs             # Rust backend: snapshot persistence
```

### Data Flow

```
API Sources (Finnhub / Polygon / Alpha Vantage)
       ↓ Rate-limited ApiService (pivot adapter)
  Internal QuoteSnapshot format
       ↓ Zustand Store (reactive)
  React Screens (display only)
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- Rust (via rustup)
- Xcode Command Line Tools (macOS)

```bash
# 1. Install Tauri CLI
cargo install tauri-cli

# 2. Install dependencies
npm install

# 3. Copy env file and add API keys (optional — mock data works without keys)
cp .env.example .env

# 4. Run in development mode
npm run tauri:dev

# 5. Build production .app for macOS
npm run tauri:build
```

---

## API Keys

All three providers work on free tiers. The app falls back to **realistic mock data** if no keys are set — perfect for development.

| Provider | Free Tier | Usage |
|----------|-----------|-------|
| [Finnhub](https://finnhub.io) | 60 calls/min | Real-time quotes, company news |
| [Polygon.io](https://polygon.io) | 5 calls/min | OHLCV history, aggregates |
| [Alpha Vantage](https://alphavantage.co) | 5 calls/min | Technical indicators, macro |

Set keys in `.env`:
```
VITE_FINNHUB_KEY=pk_...
VITE_POLYGON_KEY=...
VITE_ALPHAVANTAGE_KEY=...
```

---

## Features

### 1. Portfolio P&L
- Live unrealized P&L per position (PRU-based calculation)
- Intraday sparklines (78 data points = full trading day)
- Sector breakdown with weight allocation bars
- Add/remove positions with modal dialog
- Sort by any column (price, P&L%, weight…)

### 2. News Intelligence
- Filtered by portfolio tickers or full market
- Sentiment classification: BULL / BEAR / NEUTRAL
- Sector tagging with color-coded badges
- Time-relative timestamps ("3 minutes ago")

### 3. Market Activity
- **Table mode**: Relative volume (vs 30d avg), capital volume, % change
- **Heatmap mode**: Color-coded treemap grid (dark green → bright green → amber → red)
- Add any ticker to the watchlist
- 🔥 indicator for volume > 2× average

### 4. Macro & Calendar
- VIX, DXY, US10Y/2Y yields, Gold, BTC, WTI crude, EUR/USD
- Economic calendar with importance tiers (●●● / ●●○ / ●○○)
- Surprise indicator: actual vs forecast delta
- Filter: All / Medium+ / High-impact only

### 5. Mathematical Screener
- RSI-14 (Wilder smoothing) — oversold <30, overbought >70
- SMA Golden Cross (50 > 200) and Death Cross
- Volume Breakout (current > 2× 30d average)
- Composite bullish score 0–100
- Filter combinations with AND logic

### Global Focus Mode
Click any ticker in any screen → amber highlight propagates to all screens.
Press `ESC` to clear.

### Snapshot Mode
Click **⊞ SNAPSHOT** in the status bar to serialize the full terminal state (portfolio, market, macro) to local storage. Up to 20 snapshots retained.

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `1-5` | Switch screens |
| `ESC` | Clear focus ticker |

---

## Technical Design Decisions

### Separation of Concerns
- `financialCalc.ts` contains **zero React imports** — all pure math functions
- `apiService.ts` normalizes all provider responses to internal pivot types
- Screens consume only from Zustand store, never call APIs directly

### Rate Limiting Strategy
```
Portfolio refresh:  15s  (fast — P&L changes constantly)
News/Macro refresh: 5min (slow — save API quota)
Screener:           5min (computed from candle history)
```

Providers are tried in order: Finnhub → Polygon → Mock, with per-minute buckets enforced by `RateBucket` counters in `apiService.ts`.

### Mock Data Realism
The mock generator uses a mean-reverting random walk with:
- Per-ticker base prices seeded to realistic 2024 valuations
- Intraday volatility calibrated per market cap tier
- Correlated index/stock movements via shared seed

---

## Extending

### Add a new data provider
1. Create `src/services/newProvider.ts`
2. Implement `adaptNewProviderQuote()` returning `QuoteSnapshot`
3. Add a `canCall("newprovider")` bucket in `apiService.ts`
4. Insert the call in the fallback chain inside `fetchQuote()`

### Add a new screen
1. Create `src/screens/NewScreen.tsx`
2. Add `ScreenId` to `src/types/index.ts`
3. Register in `TABS` array and `SCREENS` map in `App.tsx`
4. Add relevant state slice to Zustand store

### Persist to SQLite
The Rust backend exposes `save_snapshot` / `load_snapshots` Tauri commands.
For full SQLite persistence, add `rusqlite` to `Cargo.toml` and implement schema migrations in `main.rs`.

---

## License
MIT
