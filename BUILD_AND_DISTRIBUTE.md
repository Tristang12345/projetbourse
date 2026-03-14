# 🚀 Bloomberg Terminal Pro — Build & Distribution

## TL;DR — une commande par OS

```bash
# macOS → produit un .dmg dans src-tauri/target/release/bundle/dmg/
npm run tauri:build

# Windows (depuis Windows) → .msi + .exe
npm run tauri:build

# Linux → .deb + .AppImage
npm run tauri:build
```

L'app résultante est **complètement autonome** : elle embarque le runtime Rust/WebKit, pas besoin de Node.js, npm, ou d'aucun outil de dev.

---

## Prérequis système (à installer une seule fois)

### macOS
```bash
# Xcode Command Line Tools
xcode-select --install

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### Windows
1. [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — cocher "Desktop development with C++"
2. [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) — généralement déjà présent sur Windows 11
3. [Rust](https://rustup.rs/) — installer depuis le site

### Linux (Debian/Ubuntu)
```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev \
  libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

---

## Étapes complètes

### 1. Clés API (obligatoire)
```bash
cp .env.example .env.local
```

Éditer `.env.local` :
```env
VITE_FINNHUB_KEY=votre_clé_finnhub
VITE_POLYGON_KEY=votre_clé_polygon
VITE_ALPHAVANTAGE_KEY=votre_clé_alphavantage
```

Obtenir les clés gratuitement :
- **Finnhub** → https://finnhub.io/register
- **Polygon** → https://polygon.io/dashboard/signup
- **Alpha Vantage** → https://www.alphavantage.co/support/#api-key

> **Sans clés API**, l'app fonctionne en **MOCK MODE** avec des données simulées réalistes.

### 2. Installer les dépendances
```bash
npm install
```

### 3. Build de production
```bash
npm run tauri:build
```

La compilation Rust prend ~3-5 minutes la première fois (compilation des dépendances).  
Les compilations suivantes sont beaucoup plus rapides (cache Cargo).

### 4. Trouver l'installeur

| OS      | Chemin                                                                 | Format       |
|---------|------------------------------------------------------------------------|--------------|
| macOS   | `src-tauri/target/release/bundle/dmg/Bloomberg Terminal Pro_1.0.0.dmg` | .dmg         |
| Windows | `src-tauri/target/release/bundle/msi/Bloomberg Terminal Pro_1.0.0.msi` | .msi         |
| Windows | `src-tauri/target/release/bundle/nsis/Bloomberg Terminal Pro_1.0.0-setup.exe` | .exe NSIS |
| Linux   | `src-tauri/target/release/bundle/deb/bloomberg-terminal-pro_1.0.0_amd64.deb` | .deb |
| Linux   | `src-tauri/target/release/bundle/appimage/Bloomberg Terminal Pro_1.0.0.AppImage` | .AppImage |

### 5. Installation

**macOS** : Glisser `.app` depuis le `.dmg` vers `/Applications`  
**Windows** : Double-clic sur le `.msi` ou `.exe`  
**Linux deb** : `sudo dpkg -i bloomberg-terminal-pro_1.0.0_amd64.deb`  
**Linux AppImage** : `chmod +x *.AppImage && ./Bloomberg\ Terminal\ Pro_1.0.0.AppImage`

---

## Mode développement (avec hot-reload)

```bash
npm run tauri:dev
```

L'app s'ouvre avec les DevTools disponibles. Les modifications React sont reflétées instantanément sans recompiler Rust.

---

## Données persistées

L'app stocke ses données dans le répertoire standard de l'OS :

| OS      | Chemin                                                      |
|---------|-------------------------------------------------------------|
| macOS   | `~/Library/Application Support/Bloomberg Terminal Pro/`     |
| Windows | `%APPDATA%\Bloomberg Terminal Pro\`                         |
| Linux   | `~/.local/share/bloomberg-terminal-pro/`                    |

Fichier SQLite : `terminal.db` dans ce répertoire — contient positions et snapshots.

---

## Notes de signature (macOS)

Sans certificat Apple Developer, macOS affichera un avertissement "développeur non identifié".  
Pour contourner **lors du premier lancement** :

```
Clic droit → Ouvrir → Ouvrir quand même
```

Pour distribuer sans avertissement : [Apple Developer Program](https://developer.apple.com/programs/) (~99$/an).

---

## Résolution de problèmes courants

| Erreur | Solution |
|--------|----------|
| `error: linker 'cc' not found` | Installer les build tools (voir Prérequis) |
| `WebView2 not found` | Installer [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) |
| `VITE_*: undefined` | Vérifier `.env.local` (pas `.env`) |
| Build > 10 min | Normal première fois — cache Cargo accélère les suivantes |
| App plante au lancement | Lancer `npm run tauri:dev` pour voir les erreurs en console |
