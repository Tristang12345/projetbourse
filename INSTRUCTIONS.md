# 📋 Instructions — Fichiers à remplacer dans bloomberg-terminal

## Comment utiliser ce dossier

Pour chaque fichier ci-dessous :
- **REMPLACER** = glisser-déposer le fichier dans le bon dossier de ton projet en écrasant l'ancien
- **CRÉER** = glisser-déposer dans le bon dossier (le fichier n'existe pas encore)

---

## 🗂 Fichiers à la racine de bloomberg-terminal/

| Fichier | Action | Ce que ça corrige |
|---|---|---|
| `package.json` | ✏️ REMPLACER | Ajoute Vitest (tests) + node>=18 requis |
| `vite.config.ts` | ✏️ REMPLACER | Configure Vitest pour lancer les tests |
| `.env.example` | ✏️ REMPLACER | Avertissement sécurité sur les clés API |

---

## 🗂 src/utils/

| Fichier | Action | Ce que ça corrige |
|---|---|---|
| `financialCalculations.test.ts` | ✅ CRÉER | 40 tests automatisés (RSI, MACD, SMA, formatters…) |

---

## 🗂 src/services/

| Fichier | Action | Ce que ça corrige |
|---|---|---|
| `dataOrchestrator.test.ts` | ✅ CRÉER | Tests du coordinateur de données (routing EU/US, fallback) |

---

## 🗂 src/hooks/

| Fichier | Action | Ce que ça corrige |
|---|---|---|
| `useApiKeys.ts` | ✅ CRÉER | Hook pour charger les clés API depuis le backend Rust |

---

## 🗂 src/screens/

| Fichier | Action | Ce que ça corrige |
|---|---|---|
| `Settings.tsx` | ✅ CRÉER | Écran de saisie des clés API (sécurisé, stocké localement) |

---

## 🗂 src/components/

| Fichier | Action | Ce que ça corrige |
|---|---|---|
| `StatusBar.tsx` | ✏️ REMPLACER | Ajoute le badge [DELAYED 15min] pour Polygon |

---

## 🗂 src-tauri/src/

| Fichier | Action | Ce que ça corrige |
|---|---|---|
| `main.rs` | ✏️ REMPLACER | Ajoute le stockage sécurisé des clés API côté Rust |
| `db.rs` | ✏️ REMPLACER | Ajoute la table SQLite pour stocker les clés API |

---

## 🗂 .github/workflows/ (dossier caché — à créer à la racine)

| Fichier | Action | Ce que ça corrige |
|---|---|---|
| `ci.yml` | ✅ CRÉER | CI/CD GitHub Actions (tests auto à chaque push) |

> ⚠️ Le dossier `.github` est caché sur Mac.
> Pour le voir dans le Finder : **Cmd + Shift + .** (point)
> S'il n'existe pas dans ton projet, crée le dossier `.github/workflows/` à la racine.

---

## ▶️ Après avoir remplacé les fichiers

Dans ton terminal, dans le dossier bloomberg-terminal :

```bash
npm install          # installe Vitest
npm test             # lance les tests
```

