//! ============================================================
//! TAURI MAIN — Command handlers bridging Rust ↔ React.
//! Each command is called via invoke() from the frontend.
//! ============================================================

// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{DbPosition, DbSnapshot, DbNewsItem};
use rusqlite::Connection;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// App-wide database connection wrapped in a Mutex for thread safety
struct AppDb(Mutex<Connection>);

// ─── Tauri Commands ───────────────────────────────────────────

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
            init_database,
            save_position,
            delete_position,
            get_positions,
            create_snapshot,
            get_snapshots,
            cache_news,
            get_cached_news,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
