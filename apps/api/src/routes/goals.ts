import { Hono } from "hono";
import { validateSafeId } from "@helm/shared";
import { getDb } from "../lib/db";
import { handleHttpError, parseJsonBody } from "../lib/http";

export const goals = new Hono();

function wouldCreateGoalCycle(
  db: ReturnType<typeof getDb>,
  companyId: string,
  goalId: string,
  candidateParentId: string,
): boolean {
  let cursor: string | null = candidateParentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === goalId) {
      return true;
    }
    if (visited.has(cursor)) {
      return true;
    }
    visited.add(cursor);
    const row = db
      .prepare("SELECT parent_id, company_id FROM goals WHERE id = ?")
      .get(cursor) as { parent_id: string | null; company_id: string } | undefined;
    if (!row || row.company_id !== companyId) {
      break;
    }
    cursor = row.parent_id;
  }
  return false;
}

goals.get("/", (c) => {
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
      `SELECT id, company_id, title, level, parent_id, description, created_at, updated_at
       FROM goals
       WHERE company_id = ?
       ORDER BY created_at ASC`,
    )
    .all(companyId);
  return c.json(rows);
});

goals.get("/:id", (c) => {
  const id = c.req.param("id");
  try {
    validateSafeId(id, "goal id");
  } catch {
    return c.json({ error: "Invalid goal id" }, 400);
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, company_id, title, level, parent_id, description, created_at, updated_at
       FROM goals WHERE id = ?`,
    )
    .get(id);
  if (!row) {
    return c.json({ error: "Goal not found" }, 404);
  }
  return c.json(row);
});

goals.post("/", async (c) => {
  try {
    const body = await parseJsonBody<{
      company_id?: string;
      title?: string;
      level?: "company" | "team" | "project";
      parent_id?: string;
      description?: string;
    }>(c);
    if (!body.company_id || !body.title || !body.level) {
      return c.json({ error: "company_id, title, level are required" }, 400);
    }
    validateSafeId(body.company_id, "company_id");
    const title = body.title.trim();
    if (!title) {
      return c.json({ error: "title cannot be empty" }, 400);
    }
    if (!["company", "team", "project"].includes(body.level)) {
      return c.json({ error: "Invalid level" }, 400);
    }
    if (body.parent_id) {
      validateSafeId(body.parent_id, "parent_id");
    }

    const db = getDb();
    const company = db
      .prepare("SELECT id FROM companies WHERE id = ?")
      .get(body.company_id) as { id: string } | undefined;
    if (!company) {
      return c.json({ error: "Company not found" }, 404);
    }
    if (body.parent_id) {
      const parent = db
        .prepare("SELECT id, company_id FROM goals WHERE id = ?")
        .get(body.parent_id) as { id: string; company_id: string } | undefined;
      if (!parent || parent.company_id !== body.company_id) {
        return c.json({ error: "parent_id must reference a goal in the same company" }, 409);
      }
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO goals (id, company_id, title, level, parent_id, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, body.company_id, title, body.level, body.parent_id ?? null, body.description ?? null, now, now);
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'board', 'goal_created', 'goal', ?, ?, ?)`,
    ).run(body.company_id, id, JSON.stringify({ title, level: body.level }), now);

    const row = db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
    return c.json(row, 201);
  } catch (error) {
    return handleHttpError(error, c);
  }
});

goals.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    validateSafeId(id, "goal id");
    const body = await parseJsonBody<{
      title?: string;
      description?: string;
      parent_id?: string | null;
    }>(c);
    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) {
        return c.json({ error: "title cannot be empty" }, 400);
      }
      updates.push("title = ?");
      values.push(title);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description);
    }
    if (body.parent_id !== undefined) {
      if (body.parent_id !== null) {
        validateSafeId(body.parent_id, "parent_id");
      }
      updates.push("parent_id = ?");
      values.push(body.parent_id);
    }
    if (updates.length === 0) {
      return c.json({ error: "No updates provided" }, 400);
    }

    const db = getDb();
    const current = db
      .prepare("SELECT id, company_id FROM goals WHERE id = ?")
      .get(id) as { id: string; company_id: string } | undefined;
    if (!current) {
      return c.json({ error: "Goal not found" }, 404);
    }
    if (body.parent_id) {
      if (body.parent_id === id) {
        return c.json({ error: "parent_id cannot be self" }, 409);
      }
      const parent = db
        .prepare("SELECT id, company_id FROM goals WHERE id = ?")
        .get(body.parent_id) as { id: string; company_id: string } | undefined;
      if (!parent || parent.company_id !== current.company_id) {
        return c.json({ error: "parent_id must reference a goal in the same company" }, 409);
      }
      if (wouldCreateGoalCycle(db, current.company_id, id, body.parent_id)) {
        return c.json({ error: "parent_id would create a cycle" }, 409);
      }
    }

    const now = new Date().toISOString();
    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);
    db.prepare(`UPDATE goals SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    db.prepare(
      `INSERT INTO activity_log (company_id, actor_type, action, entity_type, entity_id, details, created_at)
       VALUES (?, 'board', 'goal_updated', 'goal', ?, ?, ?)`,
    ).run(current.company_id, id, JSON.stringify(body), now);
    const row = db.prepare("SELECT * FROM goals WHERE id = ?").get(id);
    return c.json(row);
  } catch (error) {
    return handleHttpError(error, c);
  }
});
