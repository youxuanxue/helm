import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { health } from "./routes/health";
import { companies } from "./routes/companies";
import { approvals } from "./routes/approvals";
import { templates } from "./routes/templates";
import { issues } from "./routes/issues";
import { actionNodes } from "./routes/action-nodes";
import { heartbeatRuns } from "./routes/heartbeat";
import { agents } from "./routes/agents";
import { config } from "./lib/config";
import { agentAuth, boardAuth } from "./lib/http";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: config.webOrigins,
    credentials: true,
  }),
);
app.use("/companies/*", boardAuth());
app.use("/approvals/*", boardAuth());
app.use("/agents/*", boardAuth());
app.use("/action-nodes/:id/pause", boardAuth());
app.use("/action-nodes/:id/resume", boardAuth());
app.use("/issues/*", agentAuth());
app.use("/action-nodes/:id/handoff", agentAuth());
app.use("/action-nodes/:id/context", agentAuth());
app.use("/heartbeat-runs/*", agentAuth());

app.route("/health", health);
app.route("/companies", companies);
app.route("/approvals", approvals);
app.route("/agents", agents);
app.route("/templates", templates);
app.route("/issues", issues);
app.route("/action-nodes", actionNodes);
app.route("/heartbeat-runs", heartbeatRuns);

console.log(`Helm API starting at http://localhost:${config.port}`);
serve({ fetch: app.fetch, port: config.port });
