import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  title: text("title").notNull(),
  level: text("level", { enum: ["company", "team", "project"] }).notNull(),
  parentId: text("parent_id"),
  description: text("description"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
