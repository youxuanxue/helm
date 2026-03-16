import Database from "better-sqlite3";
import type DatabaseType from "better-sqlite3";

let _db: DatabaseType.Database | null = null;

export function getDb(dbPath?: string): DatabaseType.Database {
  if (!_db) {
    const path = dbPath ?? (process.env.HELM_DATA_DIR ? `${process.env.HELM_DATA_DIR}/helm.db` : ":memory:");
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
];

export function migrate(dbPath?: string): void {
  const db = getDb(dbPath);
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }
}
