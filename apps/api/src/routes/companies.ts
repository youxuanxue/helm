import { Hono } from "hono";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { getDb } from "../lib/db";
import { handleHttpError, HttpError, parseJsonBody } from "../lib/http";
import { validateSafeId } from "@helm/shared";
import { planTaskGraph, runCooCycle } from "@helm/scheduler";
import {
  getHeartbeatLoopStatus,
  startHeartbeatLoop,
  stopHeartbeatLoop,
} from "../lib/heartbeat-loop";

export const companies = new Hono();
const TEMPLATES_DIR = fileURLToPath(new URL("../../../../templates", import.meta.url));

type CompanyRecord = {
  id: string;
  name: string;
  mission: string;
  target_audience: string;
  company_spec: string;
  status: "active" | "paused" | "archived";
};

type CreateCompanyBody = {
  name?: string;
  mission?: string;
  target_audience?: string;
  template_id?: string;
  company_spec?: Record<string, unknown>;
};

type CompanySpecData = {
  identity?: { name?: string; id?: string; version?: string };
  mission?: { statement?: string; vision?: string };
  target_audience?: { summary?: string; [key: string]: unknown };
  deliverables?: Array<{ type?: string }>;
  [key: string]: unknown;
};

function loadTemplateSpec(templateId: string): CompanySpecData {
  try {
    validateSafeId(templateId, "template_id");
    const path = join(TEMPLATES_DIR, `${templateId}.yaml`);
    const raw = readFileSync(path, "utf-8");
    const parsed = YAML.parse(raw) as { spec?: CompanySpecData } | null;
    return parsed?.spec ?? {};
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid")) {
      throw new HttpError(400, "Invalid template_id");
    }
    throw new HttpError(404, "Template not found");
  }
}

function extractOutputTypes(companySpec: CompanySpecData): string[] {
  return (companySpec.deliverables ?? [])
    .map((item) => item.type)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

function writeActivity(
  companyId: string,
  actorType: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  const db = getDb();
  db.prepare(
    `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(companyId, actorType, action, entityType, entityId, JSON.stringify(details), new Date().toISOString());
}

companies.get("/", async (c) => {
  const db = getDb();
  const rows = db.prepare("SELECT id, name, mission, status FROM companies ORDER BY created_at DESC").all();
  return c.json(rows);
});

companies.post("/", async (c) => {
  try {
    const body = await parseJsonBody<CreateCompanyBody>(c);
    const templateSpec = body.template_id ? loadTemplateSpec(body.template_id) : {};
    const companySpec = (body.company_spec ?? templateSpec) as CompanySpecData;
    const name = (body.name ?? companySpec.identity?.name ?? "").trim();
    const mission = (body.mission ?? companySpec.mission?.statement ?? "").trim();
    const targetAudience = (body.target_audience ?? companySpec.target_audience?.summary ?? "").trim();

    if (!name || !mission || !targetAudience) {
      return c.json({ error: "name, mission, target_audience are required" }, 400);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const status = "active";
    const normalizedSpec: CompanySpecData = {
      ...companySpec,
      identity: {
        ...(companySpec.identity ?? {}),
        name,
      },
      mission: {
        ...(companySpec.mission ?? {}),
        statement: mission,
      },
      target_audience: {
        ...(companySpec.target_audience ?? {}),
        summary: targetAudience,
      },
    };
    const outputTypes = extractOutputTypes(normalizedSpec);
    const db = getDb();
    db.prepare(
      `INSERT INTO companies (id, name, mission, target_audience, company_spec, output_types, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      mission,
      targetAudience,
      JSON.stringify(normalizedSpec),
      JSON.stringify(outputTypes),
      status,
      now,
      now,
    );

    writeActivity(id, "board", "company_created", "company", id, {
      template_id: body.template_id ?? null,
    });

    return c.json(
      {
        id,
        name,
        mission,
        target_audience: targetAudience,
        status,
        created_at: now,
      },
      201,
    );
  } catch (error) {
    return handleHttpError(error, c);
  }
});

companies.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(id);
  if (!row) return c.json({ error: "Company not found" }, 404);
  return c.json(row);
});

companies.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await parseJsonBody<{
      name?: string;
      mission?: string;
      target_audience?: string;
      status?: "active" | "paused" | "archived";
    }>(c);
    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      if (!body.name.trim()) {
        return c.json({ error: "name cannot be empty" }, 400);
      }
      fields.push("name = ?");
      values.push(body.name.trim());
    }
    if (body.mission !== undefined) {
      if (!body.mission.trim()) {
        return c.json({ error: "mission cannot be empty" }, 400);
      }
      fields.push("mission = ?");
      values.push(body.mission.trim());
    }
    if (body.target_audience !== undefined) {
      if (!body.target_audience.trim()) {
        return c.json({ error: "target_audience cannot be empty" }, 400);
      }
      fields.push("target_audience = ?");
      values.push(body.target_audience.trim());
    }
    if (body.status !== undefined) {
      if (!["active", "paused", "archived"].includes(body.status)) {
        return c.json({ error: "Invalid status" }, 400);
      }
      fields.push("status = ?");
      values.push(body.status);
    }
    if (fields.length === 0) {
      return c.json({ error: "No updatable fields provided" }, 400);
    }

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    const db = getDb();
    const result = db
      .prepare(`UPDATE companies SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
    if (result.changes === 0) {
      return c.json({ error: "Company not found" }, 404);
    }

    writeActivity(id, "board", "company_updated", "company", id, body as Record<string, unknown>);
    const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(id);
    return c.json(row);
  } catch (error) {
    return handleHttpError(error, c);
  }
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
  try {
    const companyId = c.req.param("id");
    const body = await parseJsonBody<{ demand?: string; description?: string }>(c);
    const demand = (body.demand ?? body.description ?? "").trim();
    if (!demand) {
      return c.json({ error: "demand or description is required" }, 400);
    }

    const db = getDb();
    const company = db
      .prepare("SELECT id, status FROM companies WHERE id = ?")
      .get(companyId) as Pick<CompanyRecord, "id" | "status"> | undefined;
    if (!company) {
      return c.json({ error: "Company not found" }, 404);
    }
    if (company.status !== "active") {
      return c.json({ error: `Company is ${company.status}` }, 409);
    }

    const issueId = crypto.randomUUID();
    const approvalId = crypto.randomUUID();
    const now = new Date().toISOString();
    const taskGraph = planTaskGraph({
      issueId,
      demand,
    });
    const demandPayload = JSON.stringify({ demand });
    const approvalPayload = JSON.stringify({ issue_id: issueId, demand, task_graph: taskGraph });

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO issues (id, company_id, project_id, parent_id, title, description, status, assignee_agent_id, demand_payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(issueId, companyId, null, null, demand.slice(0, 200), demand, "todo", null, demandPayload, now, now);

      db.prepare(
        `INSERT INTO approvals (id, company_id, type, status, payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(approvalId, companyId, "task_graph", "pending", approvalPayload, now, now);

      db.prepare(
        `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        companyId,
        "board",
        "demand_submitted",
        "issue",
        issueId,
        JSON.stringify({ approval_id: approvalId, demand }),
        now,
      );
    });
    tx();

    return c.json(
      {
        id: issueId,
        approval_id: approvalId,
        action_node_id: taskGraph.nodes[0]?.id ?? null,
        action_node_ids: taskGraph.nodes.map((node) => node.id),
        status: "todo",
      },
      201,
    );
  } catch (error) {
    return handleHttpError(error, c);
  }
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

companies.get("/:id/activity", async (c) => {
  const companyId = c.req.param("id");
  const limitValue = parseInt(c.req.query("limit") ?? "50", 10);
  const limit = Number.isFinite(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 50;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, actor_type, action, entity_type, entity_id, details, created_at
       FROM activity_log WHERE company_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(companyId, limit);
  return c.json(rows);
});

companies.get("/:id/action-nodes", async (c) => {
  const companyId = c.req.param("id");
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT n.id, n.issue_id, n.spec_ref, n.depends_on, n.status, n.heartbeat_run_id, n.updated_at, i.title AS issue_title
              , n.retry_count, n.max_retries, n.last_error
       FROM action_nodes n
       LEFT JOIN issues i ON i.id = n.issue_id
       WHERE n.company_id = ?
       ORDER BY n.updated_at DESC`
    )
    .all(companyId);
  return c.json(rows);
});

companies.get("/:id/costs", async (c) => {
  const companyId = c.req.param("id");
  const db = getDb();
  const company = db
    .prepare("SELECT budget_cents, status FROM companies WHERE id = ?")
    .get(companyId) as { budget_cents: number | null; status: string } | undefined;
  if (!company) {
    return c.json({ error: "Company not found" }, 404);
  }
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
         COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
         COUNT(*) AS events
       FROM cost_events WHERE company_id = ?`
    )
    .get(companyId) as {
      total_cost_cents: number;
      total_input_tokens: number;
      total_output_tokens: number;
      events: number;
    };
  const overBudget =
    typeof company.budget_cents === "number" ? row.total_cost_cents >= company.budget_cents : false;
  const byBilling = db
    .prepare(
      `SELECT COALESCE(billing_code, 'default') AS billing_code, COALESCE(SUM(cost_cents), 0) AS cost_cents
       FROM cost_events WHERE company_id = ? GROUP BY billing_code ORDER BY cost_cents DESC`
    )
    .all(companyId) as Array<{ billing_code: string; cost_cents: number }>;
  return c.json({
    ...row,
    budget_cents: company.budget_cents,
    company_status: company.status,
    over_budget: overBudget,
    by_billing_code: byBilling,
  });
});

companies.patch("/:id/budget", async (c) => {
  try {
    const companyId = c.req.param("id");
    const body = await parseJsonBody<{ amount_cents?: number }>(c);
    if (typeof body.amount_cents !== "number" || !Number.isInteger(body.amount_cents) || body.amount_cents < 0) {
      return c.json({ error: "amount_cents must be a non-negative integer" }, 400);
    }

    const now = new Date().toISOString();
    const db = getDb();
    const result = db
      .prepare("UPDATE companies SET budget_cents = ?, updated_at = ? WHERE id = ?")
      .run(body.amount_cents, now, companyId);
    if (result.changes === 0) {
      return c.json({ error: "Company not found" }, 404);
    }

    writeActivity(companyId, "board", "budget_updated", "company", companyId, { amount_cents: body.amount_cents });
    const row = db
      .prepare("SELECT id, budget_cents, updated_at FROM companies WHERE id = ?")
      .get(companyId);
    return c.json(row);
  } catch (error) {
    return handleHttpError(error, c);
  }
});

companies.post("/:id/heartbeat", async (c) => {
  try {
    const companyId = c.req.param("id");
    const result = runCooCycle(companyId);
    writeActivity(companyId, "board", "heartbeat_triggered", "company", companyId, {
      run_id: result.run_id,
      scheduled_count: result.scheduled_node_ids.length,
      status: result.status,
    });
    return c.json(result, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "Company not found") {
      return c.json({ error: "Company not found" }, 404);
    }
    return handleHttpError(error, c);
  }
});

companies.post("/:id/heartbeat/start", async (c) => {
  try {
    const companyId = c.req.param("id");
    const body = await parseJsonBody<{ interval_ms?: number }>(c);
    const intervalMsRaw = body.interval_ms ?? 5000;
    const intervalMs = Number.isInteger(intervalMsRaw) ? intervalMsRaw : 5000;
    if (intervalMs < 1000 || intervalMs > 60000) {
      return c.json({ error: "interval_ms must be between 1000 and 60000" }, 400);
    }
    const db = getDb();
    const company = db
      .prepare("SELECT id FROM companies WHERE id = ?")
      .get(companyId) as { id: string } | undefined;
    if (!company) {
      return c.json({ error: "Company not found" }, 404);
    }
    const started = startHeartbeatLoop(companyId, intervalMs, () => runCooCycle(companyId));
    writeActivity(companyId, "board", "heartbeat_loop_started", "company", companyId, {
      interval_ms: intervalMs,
    });
    return c.json(started, 201);
  } catch (error) {
    return handleHttpError(error, c);
  }
});

companies.post("/:id/heartbeat/stop", async (c) => {
  const companyId = c.req.param("id");
  const stopped = stopHeartbeatLoop(companyId);
  writeActivity(companyId, "board", "heartbeat_loop_stopped", "company", companyId, {});
  return c.json(stopped);
});

companies.get("/:id/heartbeat/status", async (c) => {
  const companyId = c.req.param("id");
  const status = getHeartbeatLoopStatus(companyId);
  return c.json(status);
});

