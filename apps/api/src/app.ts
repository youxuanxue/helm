import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health";
import { companies } from "./routes/companies";
import { approvals } from "./routes/approvals";
import { templates } from "./routes/templates";
import { companyTemplates } from "./routes/company-templates";
import { issues } from "./routes/issues";
import { actionNodes } from "./routes/action-nodes";
import { heartbeatRuns } from "./routes/heartbeat";
import { agents } from "./routes/agents";
import { goals } from "./routes/goals";
import { projects } from "./routes/projects";
import { config } from "./lib/config";
import { agentAuth, boardAuth } from "./lib/http";

export function createApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: config.webOrigins,
      credentials: true,
    }),
  );
  app.use("/companies", boardAuth());
  app.use("/companies/*", boardAuth());
  app.use("/approvals", boardAuth());
  app.use("/approvals/*", boardAuth());
  app.use("/agents", boardAuth());
  app.use("/agents/*", boardAuth());
  app.use("/goals", boardAuth());
  app.use("/goals/*", boardAuth());
  app.use("/projects", boardAuth());
  app.use("/projects/*", boardAuth());
  app.use("/company-templates", boardAuth());
  app.use("/company-templates/*", boardAuth());
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
  app.route("/goals", goals);
  app.route("/projects", projects);
  app.route("/company-templates", companyTemplates);
  app.route("/templates", templates);
  app.route("/issues", issues);
  app.route("/action-nodes", actionNodes);
  app.route("/heartbeat-runs", heartbeatRuns);

  return app;
}
