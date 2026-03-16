import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const issues = sqliteTable("issues", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  projectId: text("project_id"),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", {
    enum: ["todo", "backlog", "blocked", "in_progress", "done"],
  }).notNull(),
  assigneeAgentId: text("assignee_agent_id"),
  demandPayload: text("demand_payload", { mode: "json" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
