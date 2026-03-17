import Database from "better-sqlite3";
import type DatabaseType from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

let _db: DatabaseType.Database | null = null;

export function getDb(dbPath?: string): DatabaseType.Database {
  if (!_db) {
    const path = dbPath ?? (process.env.HELM_DATA_DIR ? `${process.env.HELM_DATA_DIR}/helm.db` : ":memory:");
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    _db = new Database(path);
    _db.pragma("journal_mode = WAL");
  }
  return _db;
}

export function initDb(dbPath?: string): DatabaseType.Database {
  _db = null;
  return getDb(dbPath);
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mission TEXT NOT NULL,
    target_audience TEXT NOT NULL,
    company_spec TEXT NOT NULL,
    output_types TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    budget_cents INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    role TEXT,
    reports_to TEXT REFERENCES agents(id),
    adapter_type TEXT NOT NULL,
    adapter_config TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    project_id TEXT,
    parent_id TEXT REFERENCES issues(id),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    assignee_agent_id TEXT REFERENCES agents(id),
    demand_payload TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS action_nodes (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    issue_id TEXT REFERENCES issues(id),
    spec_ref TEXT NOT NULL,
    depends_on TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    heartbeat_run_id TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 1,
    last_handoff TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS action_edges (
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    company_id TEXT NOT NULL REFERENCES companies(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (from_node_id, to_node_id)
  )`,
  `CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cost_events (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    issue_id TEXT REFERENCES issues(id),
    billing_code TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS heartbeat_runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    company_id TEXT NOT NULL REFERENCES companies(id),
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS agent_api_keys (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
];

function ensureColumn(db: DatabaseType.Database, table: string, column: string, definition: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = rows.some((row) => row.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function migrate(dbPath?: string): void {
  const db = getDb(dbPath);
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }
  ensureColumn(db, "companies", "budget_cents", "INTEGER");
  ensureColumn(db, "action_nodes", "retry_count", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "action_nodes", "max_retries", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "action_nodes", "last_handoff", "TEXT");
  ensureColumn(db, "action_nodes", "last_error", "TEXT");
  ensureColumn(db, "cost_events", "billing_code", "TEXT");
}
