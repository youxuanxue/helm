import { Hono } from "hono";
import { getDb } from "../lib/db";

export const companies = new Hono();

companies.get("/", async (c) => {
  const db = getDb();
  const rows = db.prepare("SELECT id, name, mission, status FROM companies ORDER BY created_at DESC").all();
  return c.json(rows);
});

companies.post("/", async (c) => {
  const body = await c.req.json<{ name: string; mission: string; target_audience: string; company_spec?: object }>();
  const { name, mission, target_audience, company_spec = {} } = body;

  if (!name || !mission || !target_audience) {
    return c.json({ error: "name, mission, target_audience are required" }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const status = "active";
  const specJson = JSON.stringify(company_spec);

  const db = getDb();
  db.prepare(
    `INSERT INTO companies (id, name, mission, target_audience, company_spec, output_types, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, mission, target_audience, specJson, null, status, now, now);

  return c.json({ id, name, mission, target_audience, status, created_at: now }, 201);
});

companies.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(id);
  if (!row) return c.json({ error: "Company not found" }, 404);
  return c.json(row);
});

companies.get("/:id/issues", async (c) => {
  const companyId = c.req.param("id");
  const db = getDb();
  const rows = db
    .prepare("SELECT id, title, description, status, assignee_agent_id, created_at FROM issues WHERE company_id = ? ORDER BY created_at DESC")
    .all(companyId);
  return c.json(rows);
});

companies.post("/:id/demands", async (c) => {
  const companyId = c.req.param("id");
  const body = await c.req.json<{ demand?: string; description?: string }>();
  const demand = (body.demand ?? body.description ?? "").trim();
  if (!demand) {
    return c.json({ error: "demand or description is required" }, 400);
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const demandPayload = JSON.stringify({ demand });

  db.prepare(
    `INSERT INTO issues (id, company_id, project_id, parent_id, title, description, status, assignee_agent_id, demand_payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, companyId, null, null, demand.slice(0, 200), demand, "todo", null, demandPayload, now, now);

  const approvalId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO approvals (id, company_id, type, status, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(approvalId, companyId, "task_graph", "pending", JSON.stringify({ issue_id: id, demand }), now, now);

  return c.json({ id, approval_id: approvalId, status: "todo" }, 201);
});

companies.get("/:id/approvals", async (c) => {
  const companyId = c.req.param("id");
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, company_id, type, status, payload, created_at FROM approvals
       WHERE company_id = ? AND status = 'pending' ORDER BY created_at DESC`
    )
    .all(companyId);
  return c.json(rows);
});

