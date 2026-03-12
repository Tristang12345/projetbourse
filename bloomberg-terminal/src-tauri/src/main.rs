// ============================================================
// TAURI BACKEND — Rust entry point
// Handles SQLite persistence and native OS features
// ============================================================

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize app data directory and SQLite DB
            let app_dir = app.path_resolver()
                .app_data_dir()
                .expect("Failed to get app data directory");
            
            std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
            
            #[cfg(debug_assertions)]
            {
                let window = app.get_window("main").unwrap();
                window.open_devtools();
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_snapshot,
            load_snapshots,
            delete_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Snapshot {
    id: String,
    label: String,
    created_at: String,
    data: String,
}

/// Save a market snapshot to local SQLite
#[tauri::command]
async fn save_snapshot(
    snapshot: Snapshot,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let db_path = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("No app dir")?
        .join("terminal.db");
    
    // In a full implementation, use rusqlite here
    // For now, write to a JSON file as a simple store
    let snapshots_file = db_path.with_extension("json");
    let mut snapshots: Vec<Snapshot> = if snapshots_file.exists() {
        let content = std::fs::read_to_string(&snapshots_file).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    };
    
    snapshots.insert(0, snapshot);
    snapshots.truncate(20); // keep last 20
    
    std::fs::write(
        &snapshots_file,
        serde_json::to_string_pretty(&snapshots).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Load all saved snapshots
#[tauri::command]
async fn load_snapshots(app_handle: tauri::AppHandle) -> Result<Vec<Snapshot>, String> {
    let snapshots_file = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("No app dir")?
        .join("terminal.db.json");
    
    if !snapshots_file.exists() { return Ok(vec![]); }
    
    let content = std::fs::read_to_string(&snapshots_file).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// Delete a snapshot by ID
#[tauri::command]
async fn delete_snapshot(id: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let snapshots_file = app_handle
        .path_resolver()
        .app_data_dir()
        .ok_or("No app dir")?
        .join("terminal.db.json");
    
    if !snapshots_file.exists() { return Ok(()); }
    
    let content = std::fs::read_to_string(&snapshots_file).map_err(|e| e.to_string())?;
    let mut snapshots: Vec<Snapshot> = serde_json::from_str(&content).unwrap_or_default();
    snapshots.retain(|s| s.id != id);
    
    std::fs::write(
        &snapshots_file,
        serde_json::to_string_pretty(&snapshots).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())
}
