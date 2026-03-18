import { serve } from "@hono/node-server";
import { config } from "./lib/config";
import { createApp } from "./app";

const app = createApp();
console.log(`Helm API starting at http://localhost:${config.port}`);
serve({ fetch: app.fetch, port: config.port });
