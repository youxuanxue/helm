import { Hono } from "hono";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const templates = new Hono();

const TEMPLATES_DIR = join(process.cwd(), "..", "..", "templates");

function listTemplates(): { id: string; name: string }[] {
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
  if (id.includes("..") || id.includes("/")) {
    return c.json({ error: "Invalid template id" }, 400);
  }
  try {
    const path = join(TEMPLATES_DIR, `${id}.yaml`);
    const content = readFileSync(path, "utf-8");
    return c.json({ id, content });
  } catch {
    return c.json({ error: "Template not found" }, 404);
  }
});
