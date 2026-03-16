import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { health } from "./routes/health";
import { companies } from "./routes/companies";
import { approvals } from "./routes/approvals";
import { templates } from "./routes/templates";
import { config } from "./lib/config";

const app = new Hono();

app.use("*", cors({ origin: ["http://localhost:5173"], credentials: true }));

app.route("/health", health);
app.route("/companies", companies);
app.route("/approvals", approvals);
app.route("/templates", templates);

console.log(`Helm API starting at http://localhost:${config.port}`);
serve({ fetch: app.fetch, port: config.port });
