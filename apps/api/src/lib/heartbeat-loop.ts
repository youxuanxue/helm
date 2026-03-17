import type { CooCycleResult } from "@helm/scheduler";

type LoopState = {
  timer: NodeJS.Timeout;
  intervalMs: number;
  running: boolean;
  lastResult?: CooCycleResult;
};

const loops = new Map<string, LoopState>();

export function startHeartbeatLoop(
  companyId: string,
  intervalMs: number,
  runCycle: () => CooCycleResult,
): { started: boolean; interval_ms: number } {
  stopHeartbeatLoop(companyId);

  const state: LoopState = {
    timer: setInterval(() => {
      if (state.running) {
        return;
      }
      state.running = true;
      try {
        state.lastResult = runCycle();
      } finally {
        state.running = false;
      }
    }, intervalMs),
    intervalMs,
    running: false,
  };

  loops.set(companyId, state);
  return { started: true, interval_ms: intervalMs };
}

export function stopHeartbeatLoop(companyId: string): { stopped: boolean } {
  const existing = loops.get(companyId);
  if (!existing) {
    return { stopped: false };
  }
  clearInterval(existing.timer);
  loops.delete(companyId);
  return { stopped: true };
}

export function getHeartbeatLoopStatus(companyId: string): {
  active: boolean;
  interval_ms: number | null;
  is_running_cycle: boolean;
  last_result?: CooCycleResult;
} {
  const state = loops.get(companyId);
  if (!state) {
    return {
      active: false,
      interval_ms: null,
      is_running_cycle: false,
    };
  }
  return {
    active: true,
    interval_ms: state.intervalMs,
    is_running_cycle: state.running,
    last_result: state.lastResult,
  };
}
