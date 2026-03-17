import { Hono } from "hono";
import { validateSafeId } from "@helm/shared";
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
  budget_cents?: number;
};

function createHireApproval(body: HireRequestBody) {
  if (!body.company_id || !body.name) {
    return { error: { error: "company_id and name are required" }, status: 400 } as const;
  }
  try {
    validateSafeId(body.company_id, "company_id");
    validateSafeId(body.name.trim(), "name");
    if (body.reports_to) {
      validateSafeId(body.reports_to, "reports_to");
    }
    if (
      body.budget_cents !== undefined &&
      (!Number.isInteger(body.budget_cents) || body.budget_cents < 0)
    ) {
      return { error: { error: "budget_cents must be a non-negative integer" }, status: 400 } as const;
    }
  } catch {
    return { error: { error: "Invalid id/name format" }, status: 400 } as const;
  }
  const db = getDb();
  const company = db.prepare("SELECT id FROM companies WHERE id = ?").get(body.company_id);
  if (!company) {
    return { error: { error: "Company not found" }, status: 404 } as const;
  }
  if (body.reports_to) {
    const manager = db
      .prepare("SELECT id, company_id FROM agents WHERE id = ?")
      .get(body.reports_to) as { id: string; company_id: string } | undefined;
    if (!manager || manager.company_id !== body.company_id) {
      return {
        error: { error: "reports_to must reference an existing agent in the same company" },
        status: 409,
      } as const;
    }
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
    budget_cents: body.budget_cents ?? null,
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
  try {
    validateSafeId(companyId, "company_id");
  } catch {
    return c.json({ error: "Invalid company_id format" }, 400);
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, company_id, name, role, reports_to, adapter_type, budget_cents, status, created_at, updated_at
       FROM agents WHERE company_id = ? ORDER BY created_at DESC`
    )
    .all(companyId);
  return c.json(rows);
});

agents.patch("/:id/budget", async (c) => {
  try {
    const agentId = c.req.param("id");
    const body = await parseJsonBody<{ company_id?: string; amount_cents?: number }>(c);
    if (!body.company_id) {
      return c.json({ error: "company_id is required" }, 400);
    }
    validateSafeId(agentId, "agent_id");
    validateSafeId(body.company_id, "company_id");
    if (
      typeof body.amount_cents !== "number" ||
      !Number.isInteger(body.amount_cents) ||
      body.amount_cents < 0
    ) {
      return c.json({ error: "amount_cents must be a non-negative integer" }, 400);
    }

    const now = new Date().toISOString();
    const db = getDb();
    const result = db
      .prepare("UPDATE agents SET budget_cents = ?, updated_at = ? WHERE id = ? AND company_id = ?")
      .run(body.amount_cents, now, agentId, body.company_id);
    if (result.changes === 0) {
      return c.json({ error: "Agent not found" }, 404);
    }
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'board', 'agent_budget_updated', 'agent', ?, ?, ?)`,
    ).run(body.company_id, agentId, JSON.stringify({ amount_cents: body.amount_cents }), now);
    const row = db
      .prepare("SELECT id, company_id, budget_cents, updated_at FROM agents WHERE id = ? AND company_id = ?")
      .get(agentId, body.company_id);
    return c.json(row);
  } catch (error) {
    return handleHttpError(error, c);
  }
});

agents.post("/", async (c) => {
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
