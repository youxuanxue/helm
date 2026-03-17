import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const agentApiKeys = sqliteTable("agent_api_keys", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  keyHash: text("key_hash").notNull(),
  createdAt: text("created_at").notNull(),
});
