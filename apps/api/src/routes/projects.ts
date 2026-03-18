import { Hono } from "hono";
import { validateSafeId } from "@helm/shared";
import { getDb } from "../lib/db";
import { handleHttpError, parseJsonBody } from "../lib/http";

export const projects = new Hono();

projects.get("/", (c) => {
  const companyId = c.req.query("company_id");
  if (!companyId) {
    return c.json({ error: "company_id is required" }, 400);
  }
  try {
    validateSafeId(companyId, "company_id");
  } catch {
    return c.json({ error: "Invalid company_id" }, 400);
  }
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, company_id, goal_id, name, status, created_at, updated_at
       FROM projects
       WHERE company_id = ?
       ORDER BY created_at ASC`,
    )
    .all(companyId);
  return c.json(rows);
});

projects.get("/:id", (c) => {
  const id = c.req.param("id");
  try {
    validateSafeId(id, "project id");
  } catch {
    return c.json({ error: "Invalid project id" }, 400);
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, company_id, goal_id, name, status, created_at, updated_at
       FROM projects WHERE id = ?`,
    )
    .get(id);
  if (!row) {
    return c.json({ error: "Project not found" }, 404);
  }
  return c.json(row);
});

projects.post("/", async (c) => {
  try {
    const body = await parseJsonBody<{
      company_id?: string;
      goal_id?: string;
      name?: string;
      status?: "active" | "paused" | "completed" | "archived";
    }>(c);
    if (!body.company_id || !body.goal_id || !body.name) {
      return c.json({ error: "company_id, goal_id, name are required" }, 400);
    }
    validateSafeId(body.company_id, "company_id");
    validateSafeId(body.goal_id, "goal_id");
    const name = body.name.trim();
    if (!name) {
      return c.json({ error: "name cannot be empty" }, 400);
    }
    const status = body.status ?? "active";
    if (!["active", "paused", "completed", "archived"].includes(status)) {
      return c.json({ error: "Invalid status" }, 400);
    }

    const db = getDb();
    const company = db
      .prepare("SELECT id FROM companies WHERE id = ?")
      .get(body.company_id) as { id: string } | undefined;
    if (!company) {
      return c.json({ error: "Company not found" }, 404);
    }
    const goal = db
      .prepare("SELECT id, company_id FROM goals WHERE id = ?")
      .get(body.goal_id) as { id: string; company_id: string } | undefined;
    if (!goal || goal.company_id !== body.company_id) {
      return c.json({ error: "goal_id must reference a goal in the same company" }, 409);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (id, company_id, goal_id, name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, body.company_id, body.goal_id, name, status, now, now);
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'board', 'project_created', 'project', ?, ?, ?)`,
    ).run(body.company_id, id, JSON.stringify({ name, goal_id: body.goal_id, status }), now);

    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return c.json(row, 201);
  } catch (error) {
    return handleHttpError(error, c);
  }
});

projects.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    validateSafeId(id, "project id");
    const body = await parseJsonBody<{
      name?: string;
      status?: "active" | "paused" | "completed" | "archived";
      goal_id?: string;
    }>(c);
    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) {
        return c.json({ error: "name cannot be empty" }, 400);
      }
      updates.push("name = ?");
      values.push(name);
    }
    if (body.status !== undefined) {
      if (!["active", "paused", "completed", "archived"].includes(body.status)) {
        return c.json({ error: "Invalid status" }, 400);
      }
      updates.push("status = ?");
      values.push(body.status);
    }

    const db = getDb();
    const current = db
      .prepare("SELECT id, company_id FROM projects WHERE id = ?")
      .get(id) as { id: string; company_id: string } | undefined;
    if (!current) {
      return c.json({ error: "Project not found" }, 404);
    }
    if (body.goal_id !== undefined) {
      validateSafeId(body.goal_id, "goal_id");
      const goal = db
        .prepare("SELECT id, company_id FROM goals WHERE id = ?")
        .get(body.goal_id) as { id: string; company_id: string } | undefined;
      if (!goal || goal.company_id !== current.company_id) {
        return c.json({ error: "goal_id must reference a goal in the same company" }, 409);
      }
      updates.push("goal_id = ?");
      values.push(body.goal_id);
    }

    if (updates.length === 0) {
      return c.json({ error: "No updates provided" }, 400);
    }
    const now = new Date().toISOString();
    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);
    db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'board', 'project_updated', 'project', ?, ?, ?)`,
    ).run(current.company_id, id, JSON.stringify(body), now);
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return c.json(row);
  } catch (error) {
    return handleHttpError(error, c);
  }
});
