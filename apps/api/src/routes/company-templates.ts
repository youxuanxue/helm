import { Hono } from "hono";
import { validateSafeId } from "@helm/shared";
import { getDb } from "../lib/db";
import { handleHttpError, parseJsonBody } from "../lib/http";

export const companyTemplates = new Hono();

companyTemplates.get("/", (c) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, name, version, description, created_at, updated_at
       FROM company_templates
       ORDER BY created_at DESC`,
    )
    .all();
  return c.json(rows);
});

companyTemplates.get("/:id", (c) => {
  const id = c.req.param("id");
  try {
    validateSafeId(id, "template id");
  } catch {
    return c.json({ error: "Invalid template id" }, 400);
  }
  const db = getDb();
  const row = db.prepare("SELECT * FROM company_templates WHERE id = ?").get(id);
  if (!row) {
    return c.json({ error: "Template not found" }, 404);
  }
  return c.json(row);
});

companyTemplates.post("/", async (c) => {
  try {
    const body = await parseJsonBody<{
      id?: string;
      name?: string;
      version?: string;
      description?: string;
      spec?: Record<string, unknown>;
    }>(c);
    if (!body.id || !body.name || !body.spec) {
      return c.json({ error: "id, name, spec are required" }, 400);
    }
    validateSafeId(body.id, "template id");
    const name = body.name.trim();
    if (!name) {
      return c.json({ error: "name cannot be empty" }, 400);
    }
    const version = body.version?.trim() || "1.0.0";
    const now = new Date().toISOString();
    const db = getDb();
    db.prepare(
      `INSERT INTO company_templates (id, name, version, description, spec, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(body.id, name, version, body.description ?? null, JSON.stringify(body.spec), now, now);
    return c.json({ id: body.id, name, version }, 201);
  } catch (error) {
    return handleHttpError(error, c);
  }
});

companyTemplates.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    validateSafeId(id, "template id");
    const body = await parseJsonBody<{
      name?: string;
      version?: string;
      description?: string;
      spec?: Record<string, unknown>;
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
    if (body.version !== undefined) {
      const version = body.version.trim();
      if (!version) {
        return c.json({ error: "version cannot be empty" }, 400);
      }
      updates.push("version = ?");
      values.push(version);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description);
    }
    if (body.spec !== undefined) {
      updates.push("spec = ?");
      values.push(JSON.stringify(body.spec));
    }
    if (updates.length === 0) {
      return c.json({ error: "No updates provided" }, 400);
    }

    const now = new Date().toISOString();
    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);
    const db = getDb();
    const result = db.prepare(`UPDATE company_templates SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    if (result.changes === 0) {
      return c.json({ error: "Template not found" }, 404);
    }
    return c.json(db.prepare("SELECT * FROM company_templates WHERE id = ?").get(id));
  } catch (error) {
    return handleHttpError(error, c);
  }
});
