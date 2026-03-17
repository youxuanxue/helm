import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const companyTemplates = sqliteTable("company_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  description: text("description"),
  spec: text("spec", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
