//! ============================================================
//! DATABASE LAYER — SQLite via rusqlite
//! Manages: positions, news snapshots, market snapshots.
//! All public functions are called from Tauri commands.
//! ============================================================

use rusqlite::{Connection, Result, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Represents a stored portfolio position
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbPosition {
    pub id:         String,
    pub ticker:     String,
    pub name:       String,
    pub sector:     String,
    pub quantity:   f64,
    pub avg_cost:   f64,
    pub added_at:   i64,
}

/// A saved market snapshot
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbSnapshot {
    pub id:         i64,
    pub label:      String,
    pub data_json:  String,
    pub created_at: i64,
}

/// Cached news item
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbNewsItem {
    pub id:           String,
    pub ticker:       Option<String>,
    pub headline:     String,
    pub summary:      String,
    pub source:       String,
    pub url:          String,
    pub published_at: i64,
    pub tags_json:    String,
    pub sentiment:    Option<String>,
}

/// Open (or create) the SQLite DB at the app data directory
pub fn open_db(app_dir: &PathBuf) -> Result<Connection> {
    let db_path = app_dir.join("terminal.db");
    let conn    = Connection::open(db_path)?;
    // Enable WAL mode for better concurrent read performance
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

/// Create all tables if they don't exist
pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS positions (
            id         TEXT PRIMARY KEY,
            ticker     TEXT NOT NULL,
            name       TEXT NOT NULL,
            sector     TEXT NOT NULL DEFAULT '',
            quantity   REAL NOT NULL,
            avg_cost   REAL NOT NULL,
            added_at   INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS snapshots (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            label      TEXT NOT NULL,
            data_json  TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS news_cache (
            id           TEXT PRIMARY KEY,
            ticker       TEXT,
            headline     TEXT NOT NULL,
            summary      TEXT NOT NULL DEFAULT '',
            source       TEXT NOT NULL DEFAULT '',
            url          TEXT NOT NULL DEFAULT '',
            published_at INTEGER NOT NULL,
            tags_json    TEXT NOT NULL DEFAULT '[]',
            sentiment    TEXT,
            cached_at    INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_news_ticker     ON news_cache(ticker);
        CREATE INDEX IF NOT EXISTS idx_news_published  ON news_cache(published_at DESC);
        CREATE INDEX IF NOT EXISTS idx_snapshots_ts    ON snapshots(created_at DESC);
    ")?;
    Ok(())
}

// ─── Positions ────────────────────────────────────────────────

pub fn upsert_position(conn: &Connection, pos: &DbPosition) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO positions
         (id, ticker, name, sector, quantity, avg_cost, added_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            pos.id, pos.ticker, pos.name, pos.sector,
            pos.quantity, pos.avg_cost, pos.added_at,
        ],
    )?;
    Ok(())
}

pub fn delete_position(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM positions WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn get_all_positions(conn: &Connection) -> Result<Vec<DbPosition>> {
    let mut stmt = conn.prepare(
        "SELECT id, ticker, name, sector, quantity, avg_cost, added_at
         FROM positions ORDER BY added_at DESC"
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DbPosition {
            id:       row.get(0)?,
            ticker:   row.get(1)?,
            name:     row.get(2)?,
            sector:   row.get(3)?,
            quantity: row.get(4)?,
            avg_cost: row.get(5)?,
            added_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

// ─── Snapshots ────────────────────────────────────────────────

pub fn save_snapshot(conn: &Connection, label: &str, data_json: &str) -> Result<i64> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO snapshots (label, data_json, created_at) VALUES (?1, ?2, ?3)",
        params![label, data_json, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_snapshots(conn: &Connection, limit: usize) -> Result<Vec<DbSnapshot>> {
    let mut stmt = conn.prepare(
        "SELECT id, label, data_json, created_at
         FROM snapshots ORDER BY created_at DESC LIMIT ?1"
    )?;
    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(DbSnapshot {
            id:         row.get(0)?,
            label:      row.get(1)?,
            data_json:  row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

// ─── News Cache ───────────────────────────────────────────────

pub fn upsert_news(conn: &Connection, item: &DbNewsItem) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT OR REPLACE INTO news_cache
         (id, ticker, headline, summary, source, url, published_at, tags_json, sentiment, cached_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            item.id, item.ticker, item.headline, item.summary,
            item.source, item.url, item.published_at,
            item.tags_json, item.sentiment, now,
        ],
    )?;
    Ok(())
}

pub fn get_cached_news(
    conn: &Connection,
    ticker: Option<&str>,
    limit: usize,
) -> Result<Vec<DbNewsItem>> {
    let (sql, p1): (String, Option<String>) = if let Some(t) = ticker {
        (
            format!("SELECT id, ticker, headline, summary, source, url,
                     published_at, tags_json, sentiment
                     FROM news_cache WHERE ticker = ?1
                     ORDER BY published_at DESC LIMIT {}", limit),
            Some(t.to_string()),
        )
    } else {
        (
            format!("SELECT id, ticker, headline, summary, source, url,
                     published_at, tags_json, sentiment
                     FROM news_cache ORDER BY published_at DESC LIMIT {}", limit),
            None,
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let rows = if let Some(t) = p1 {
        stmt.query_map(params![t], |row| {
            Ok(DbNewsItem {
                id:           row.get(0)?,
                ticker:       row.get(1)?,
                headline:     row.get(2)?,
                summary:      row.get(3)?,
                source:       row.get(4)?,
                url:          row.get(5)?,
                published_at: row.get(6)?,
                tags_json:    row.get(7)?,
                sentiment:    row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map([], |row| {
            Ok(DbNewsItem {
                id:           row.get(0)?,
                ticker:       row.get(1)?,
                headline:     row.get(2)?,
                summary:      row.get(3)?,
                source:       row.get(4)?,
                url:          row.get(5)?,
                published_at: row.get(6)?,
                tags_json:    row.get(7)?,
                sentiment:    row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?
    };

    Ok(rows)
}

/// Prune news older than N days
pub fn prune_old_news(conn: &Connection, days: i64) -> Result<usize> {
    let cutoff = chrono::Utc::now().timestamp_millis() - (days * 86_400_000);
    let deleted = conn.execute(
        "DELETE FROM news_cache WHERE published_at < ?1",
        params![cutoff],
    )?;
    Ok(deleted)
}
