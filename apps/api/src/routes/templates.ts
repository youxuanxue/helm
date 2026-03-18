import { Hono } from "hono";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSafeId } from "@helm/shared";
import YAML from "yaml";
import { getDb } from "../lib/db";

export const templates = new Hono();

const TEMPLATES_DIR = fileURLToPath(new URL("../../../../templates", import.meta.url));

function listTemplates(): { id: string; name: string }[] {
  const db = getDb();
  const dbRows = db
    .prepare("SELECT id, name, version FROM company_templates ORDER BY created_at DESC")
    .all() as Array<{ id: string; name: string; version: string }>;
  if (dbRows.length > 0) {
    return dbRows.map((row) => ({
      id: row.id,
      name: `${row.name} (${row.version})`,
    }));
  }
  try {
    const files = readdirSync(TEMPLATES_DIR, { withFileTypes: true });
    return files
      .filter((f) => f.isFile() && f.name.endsWith(".yaml"))
      .map((f) => {
        const id = f.name.replace(".yaml", "");
        const name = id
          .split("-")
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(" ");
        return { id, name };
      });
  } catch {
    return [
      { id: "empty", name: "Empty" },
      { id: "content-studio", name: "Content Studio" },
      { id: "dev-studio", name: "Dev Studio" },
    ];
  }
}

templates.get("/", (c) => {
  return c.json(listTemplates());
});

templates.get("/:id", (c) => {
  const id = c.req.param("id");
  try {
    validateSafeId(id, "template_id");
  } catch {
    return c.json({ error: "Invalid template id" }, 400);
  }

  const db = getDb();
  const dbRow = db
    .prepare("SELECT id, spec FROM company_templates WHERE id = ?")
    .get(id) as { id: string; spec: string } | undefined;
  if (dbRow) {
    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(dbRow.spec) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Template spec is invalid JSON" }, 500);
    }
    return c.json({
      id: dbRow.id,
      content: YAML.stringify({
        apiVersion: "opc/company_template/v1",
        kind: "CompanyTemplate",
        spec,
      }),
    });
  }

  try {
    const path = join(TEMPLATES_DIR, `${id}.yaml`);
    const content = readFileSync(path, "utf-8");
    return c.json({ id, content });
  } catch {
    return c.json({ error: "Template not found" }, 404);
  }
});
