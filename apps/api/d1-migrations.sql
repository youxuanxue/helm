CREATE TABLE IF NOT EXISTS companies (
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
  );

CREATE TABLE IF NOT EXISTS company_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    description TEXT,
    spec TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    role TEXT,
    reports_to TEXT REFERENCES agents(id),
    adapter_type TEXT NOT NULL,
    adapter_config TEXT NOT NULL,
    budget_cents INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    title TEXT NOT NULL,
    level TEXT NOT NULL,
    parent_id TEXT REFERENCES goals(id),
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    goal_id TEXT REFERENCES goals(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS issues (
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
  );

CREATE TABLE IF NOT EXISTS action_nodes (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    issue_id TEXT REFERENCES issues(id),
    spec_ref TEXT NOT NULL,
    depends_on TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    heartbeat_run_id TEXT,
    adapter_run_id TEXT,
    adapter_status TEXT,
    executor_agent_id TEXT REFERENCES agents(id),
    invoked_at TEXT,
    completed_at TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 1,
    last_handoff TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS action_edges (
    from_node_id TEXT NOT NULL,
    to_node_id TEXT NOT NULL,
    company_id TEXT NOT NULL REFERENCES companies(id),
    created_at TEXT NOT NULL,
    PRIMARY KEY (from_node_id, to_node_id)
  );

CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT
  );

CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS cost_events (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    issue_id TEXT REFERENCES issues(id),
    billing_code TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

CREATE TABLE IF NOT EXISTS heartbeat_runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    company_id TEXT NOT NULL REFERENCES companies(id),
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT
  );

CREATE TABLE IF NOT EXISTS agent_api_keys (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    key_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
