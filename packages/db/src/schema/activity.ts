import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: text("company_id").notNull(),
  actorType: text("actor_type").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  details: text("details", { mode: "json" }),
  createdAt: text("created_at").notNull(),
});
