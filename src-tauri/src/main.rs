//! ============================================================
//! TAURI MAIN — Command handlers bridging Rust ↔ React.
//! Each command is called via invoke() from the frontend.
//!
//! ✅ SÉCURITÉ CLÉS API :
//! Les clés API sont stockées dans la base SQLite locale (chiffrée
//! par le système d'exploitation via le répertoire AppData) et non
//! plus dans les variables d'environnement VITE_* du bundle JS.
//! Elles ne sont jamais exposées dans le bundle frontend distribué.
//! ============================================================

// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{DbPosition, DbSnapshot, DbNewsItem};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// App-wide database connection wrapped in a Mutex for thread safety
struct AppDb(Mutex<Connection>);

// ─── API Keys Types ───────────────────────────────────────────

/// All API keys stored together for atomic read/write
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ApiKeys {
    pub finnhub:      String,
    pub polygon:      String,
    pub alphavantage: String,
}

// ─── Tauri Commands — DB ──────────────────────────────────────

/// Initialize DB and return existing positions
#[tauri::command]
fn init_database(app: AppHandle, db: State<AppDb>) -> Result<Vec<DbPosition>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::init_schema(&conn).map_err(|e| e.to_string())?;
    db::get_all_positions(&conn).map_err(|e| e.to_string())
}

/// Save/update a position
#[tauri::command]
fn save_position(db: State<AppDb>, position: DbPosition) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::upsert_position(&conn, &position).map_err(|e| e.to_string())
}

/// Delete a position by ID
#[tauri::command]
fn delete_position(db: State<AppDb>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::delete_position(&conn, &id).map_err(|e| e.to_string())
}

/// Get all positions
#[tauri::command]
fn get_positions(db: State<AppDb>) -> Result<Vec<DbPosition>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_all_positions(&conn).map_err(|e| e.to_string())
}

/// Create a named snapshot of the terminal state
#[tauri::command]
fn create_snapshot(
    db:        State<AppDb>,
    label:     String,
    data_json: String,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::save_snapshot(&conn, &label, &data_json).map_err(|e| e.to_string())
}

/// Retrieve recent snapshots
#[tauri::command]
fn get_snapshots(db: State<AppDb>, limit: usize) -> Result<Vec<DbSnapshot>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_snapshots(&conn, limit).map_err(|e| e.to_string())
}

/// Cache a batch of news items
#[tauri::command]
fn cache_news(db: State<AppDb>, items: Vec<DbNewsItem>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut count = 0;
    for item in &items {
        db::upsert_news(&conn, item).map_err(|e| e.to_string())?;
        count += 1;
    }
    // Auto-prune news older than 30 days
    let _ = db::prune_old_news(&conn, 30);
    Ok(count)
}

/// Fetch cached news for a ticker (or all if ticker is None)
#[tauri::command]
fn get_cached_news(
    db:     State<AppDb>,
    ticker: Option<String>,
    limit:  usize,
) -> Result<Vec<DbNewsItem>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_cached_news(&conn, ticker.as_deref(), limit).map_err(|e| e.to_string())
}

// ─── Tauri Commands — API Keys ────────────────────────────────

/// Save API keys to the local SQLite DB (never exposed in the JS bundle).
///
/// Called once from the Settings screen when the user enters their keys.
/// Keys are stored in the app data directory (~/.local/share or ~/Library/…)
/// which is not accessible to other apps on the system.
#[tauri::command]
fn save_api_keys(db: State<AppDb>, keys: ApiKeys) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::save_api_keys(&conn, &keys).map_err(|e| e.to_string())
}

/// Load stored API keys and return them to the frontend.
///
/// The frontend uses these keys to make API calls at runtime.
/// They are never baked into the compiled JS bundle.
#[tauri::command]
fn get_api_keys(db: State<AppDb>) -> Result<ApiKeys, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::get_api_keys(&conn).map_err(|e| e.to_string())
}

/// Check whether API keys have been configured by the user.
/// Returns true if at least one key is non-empty.
#[tauri::command]
fn has_api_keys(db: State<AppDb>) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let keys = db::get_api_keys(&conn).map_err(|e| e.to_string())?;
    Ok(!keys.finnhub.is_empty()
        || !keys.polygon.is_empty()
        || !keys.alphavantage.is_empty())
}

/// Delete all stored API keys (reset).
#[tauri::command]
fn clear_api_keys(db: State<AppDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    db::save_api_keys(&conn, &ApiKeys::default()).map_err(|e| e.to_string())
}

// ─── Main ─────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Determine app data directory for the DB file
            let app_dir = app
                .path_resolver()
                .app_data_dir()
                .expect("Failed to resolve app data directory");

            std::fs::create_dir_all(&app_dir)
                .expect("Failed to create app data directory");

            // Open DB and initialize schema
            let conn = db::open_db(&app_dir)
                .expect("Failed to open SQLite database");
            db::init_schema(&conn)
                .expect("Failed to initialize DB schema");

            // Register as managed state
            app.manage(AppDb(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // DB — positions & snapshots
            init_database,
            save_position,
            delete_position,
            get_positions,
            create_snapshot,
            get_snapshots,
            cache_news,
            get_cached_news,
            // API Keys — secure storage
            save_api_keys,
            get_api_keys,
            has_api_keys,
            clear_api_keys,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
