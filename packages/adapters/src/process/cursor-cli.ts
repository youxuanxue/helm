import { spawn } from "node:child_process";
import type { Agent, AgentAdapter, InvocationContext, InvokeResult, RunStatus } from "../types";

const runs = new Map<string, { proc: ReturnType<typeof spawn> }>();

export const cursorCliAdapter: AgentAdapter = {
  type: "cursor_cli",

  async invoke(agent: Agent, context: InvocationContext): Promise<InvokeResult> {
    const config = agent.adapter_config as {
      command?: string;
      argsTemplate?: string;
      workspacePath?: string;
      stdinMode?: "handoff_json" | "prompt_only";
    };
    const command = config.command ?? "cursor";
    const stdinMode = config.stdinMode ?? "prompt_only";
    const workspacePath = config.workspacePath ?? context.metadata?.workspace_path ?? process.cwd();

    const prompt = context.message.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join("\n\n");

    const args = ["agent", "--prompt", prompt];
    const runId = crypto.randomUUID();

    const proc = spawn(command, args, {
      cwd: workspacePath,
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (stdinMode === "handoff_json") {
      proc.stdin?.write(JSON.stringify(context));
      proc.stdin?.end();
    }

    runs.set(runId, { proc });

    proc.on("exit", () => {
      runs.delete(runId);
    });

    return { run_id: runId, status: "working" };
  },

  async status(runId: string, agent: Agent): Promise<RunStatus> {
    const entry = runs.get(runId);
    if (!entry) {
      return { state: "succeed" };
    }
    const exited = !entry.proc.stdin?.writable && entry.proc.exitCode != null;
    return { state: exited ? "succeed" : "working" };
  },

  async cancel(runId: string, agent: Agent): Promise<void> {
    const entry = runs.get(runId);
    if (entry?.proc) {
      entry.proc.kill("SIGTERM");
      runs.delete(runId);
    }
  },
};
