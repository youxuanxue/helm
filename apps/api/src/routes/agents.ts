import { Hono } from "hono";
import { getDb } from "../lib/db";
import { handleHttpError, parseJsonBody } from "../lib/http";

export const agents = new Hono();

type HireRequestBody = {
  company_id?: string;
  name?: string;
  role?: string;
  reports_to?: string;
  adapter_type?: string;
  adapter_config?: Record<string, unknown>;
};

function createHireApproval(body: HireRequestBody) {
  if (!body.company_id || !body.name) {
    return { error: { error: "company_id and name are required" }, status: 400 } as const;
  }
  const db = getDb();
  const company = db.prepare("SELECT id FROM companies WHERE id = ?").get(body.company_id);
  if (!company) {
    return { error: { error: "Company not found" }, status: 404 } as const;
  }

  const now = new Date().toISOString();
  const approvalId = crypto.randomUUID();
  const payload = {
    company_id: body.company_id,
    name: body.name.trim(),
    role: body.role ?? null,
    reports_to: body.reports_to ?? null,
    adapter_type: body.adapter_type ?? "process",
    adapter_config: body.adapter_config ?? {},
  };
  db.prepare(
    `INSERT INTO approvals (id, company_id, type, status, payload, created_at, updated_at)
     VALUES (?, ?, 'hire_agent', 'pending', ?, ?, ?)`
  ).run(approvalId, body.company_id, JSON.stringify(payload), now, now);
  db.prepare(
    `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
     VALUES (?, 'coo', 'hire_agent_requested', 'approval', ?, ?, ?)`
  ).run(body.company_id, approvalId, JSON.stringify({ candidate: payload.name, role: payload.role }), now);

  return {
    data: { approval_id: approvalId, status: "pending", payload },
    status: 201,
  } as const;
}

agents.get("/", (c) => {
  const companyId = c.req.query("company_id");
  if (!companyId) {
    return c.json({ error: "company_id is required" }, 400);
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, company_id, name, role, reports_to, adapter_type, status, created_at, updated_at
       FROM agents WHERE company_id = ? ORDER BY created_at DESC`
    )
    .all(companyId);
  return c.json(rows);
});

agents.post("/", async (c) => {
  try {
    const body = await parseJsonBody<HireRequestBody>(c);
    const result = createHireApproval(body);
    if ("error" in result) {
      return c.json(result.error, result.status);
    }
    // Keep POST /agents for compatibility, but enforce approval-based hiring.
    return c.json(result.data, result.status);
  } catch (error) {
    return handleHttpError(error, c);
  }
});

agents.post("/hire-request", async (c) => {
  try {
    const body = await parseJsonBody<HireRequestBody>(c);
    const result = createHireApproval(body);
    if ("error" in result) {
      return c.json(result.error, result.status);
    }
    return c.json(result.data, result.status);
  } catch (error) {
    return handleHttpError(error, c);
  }
});
