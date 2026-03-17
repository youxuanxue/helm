import { spawn } from "node:child_process";
import type {
  Agent,
  AgentAdapter,
  Artifact,
  InvocationContext,
  InvokeResult,
  Part,
  RunStatus,
} from "../types";

type RunEntry = {
  state: RunStatus["state"];
  message?: Part[];
  artifacts?: Artifact[];
  error?: { code: string; message: string };
  proc?: ReturnType<typeof spawn>;
};

const runs = new Map<string, RunEntry>();

function toPrompt(context: InvocationContext): string {
  return context.message.parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n\n");
}

function clipText(text: string, maxLength = 2000): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

export const processAdapter: AgentAdapter = {
  type: "process",

  async invoke(agent: Agent, context: InvocationContext): Promise<InvokeResult> {
    const runId = crypto.randomUUID();
    const config = agent.adapter_config as {
      command?: string;
      args?: string[];
      workspacePath?: string;
      stdinMode?: "handoff_json" | "prompt_only";
    };

    if (!config.command) {
      runs.set(runId, {
        state: "succeed",
        message: [
          {
            type: "text",
            text: "No process command configured. Completed with mock process adapter.",
          },
        ],
      });
      return { run_id: runId, status: "submitted" };
    }

    const cwd = config.workspacePath ?? context.metadata?.workspace_path ?? process.cwd();
    const args = Array.isArray(config.args) ? config.args : [];
    const stdinMode = config.stdinMode ?? "prompt_only";
    const prompt = toPrompt(context);
    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    const proc = spawn(config.command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    runs.set(runId, { state: "working", proc });

    if (stdinMode === "handoff_json") {
      proc.stdin?.write(JSON.stringify(context));
    } else {
      proc.stdin?.write(prompt);
    }
    proc.stdin?.end();

    proc.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(String(chunk));
    });
    proc.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(String(chunk));
    });

    proc.on("error", (error) => {
      runs.set(runId, {
        state: "failed",
        error: { code: "PROCESS_ERROR", message: error.message },
        message: [{ type: "text", text: clipText(stderrChunks.join("") || error.message) }],
      });
    });

    proc.on("exit", (code, signal) => {
      const stdout = clipText(stdoutChunks.join(""));
      const stderr = clipText(stderrChunks.join(""));
      if (code === 0) {
        runs.set(runId, {
          state: "succeed",
          message: stdout ? [{ type: "text", text: stdout }] : undefined,
          artifacts: stdout
            ? [
                {
                  name: "process.stdout",
                  index: 0,
                  parts: [{ type: "text", text: stdout }],
                },
              ]
            : undefined,
        });
        return;
      }
      runs.set(runId, {
        state: "failed",
        error: {
          code: "PROCESS_EXIT_NONZERO",
          message: `Process exited with code ${code ?? "unknown"} signal ${signal ?? "none"}`,
        },
        message: [{ type: "text", text: stderr || stdout || "Process failed without output" }],
      });
    });

    return { run_id: runId, status: "working" };
  },

  async status(runId: string): Promise<RunStatus> {
    const entry = runs.get(runId);
    if (!entry) {
      return {
        state: "failed",
        error: { code: "RUN_NOT_FOUND", message: "Run not found" },
      };
    }
    return {
      state: entry.state,
      message: entry.message,
      artifacts: entry.artifacts,
      error: entry.error,
    };
  },

  async cancel(runId: string): Promise<void> {
    const entry = runs.get(runId);
    if (!entry) {
      return;
    }
    if (entry.proc && entry.state === "working") {
      entry.proc.kill("SIGTERM");
    }
    runs.set(runId, {
      state: "cancelled",
      message: [{ type: "text", text: "Cancelled by control plane" }],
    });
  },
};
