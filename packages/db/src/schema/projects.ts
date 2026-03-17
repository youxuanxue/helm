import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  goalId: text("goal_id"),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "paused", "completed", "archived"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
