import type { Context, Next } from "hono";
import { config } from "./config";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function parseJsonBody<T>(c: Context, maxBytes = config.maxBodyBytes): Promise<T> {
  const contentLength = c.req.header("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
  }

  const raw = await c.req.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new HttpError(413, `Request body exceeds ${maxBytes} bytes`);
  }
  if (!raw.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

export function boardAuth() {
  return async (c: Context, next: Next) => {
    if (!config.boardToken) {
      await next();
      return;
    }

    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${config.boardToken}`) {
      c.status(401);
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized board token" });
    }
    await next();
  };
}

export function agentAuth() {
  return async (c: Context, next: Next) => {
    if (!config.agentToken) {
      await next();
      return;
    }

    const auth = c.req.header("authorization");
    if (auth !== `Bearer ${config.agentToken}`) {
      c.status(401);
      c.header("WWW-Authenticate", "Bearer");
      return c.json({ error: "Unauthorized agent token" });
    }
    await next();
  };
}

export function handleHttpError(error: unknown, c: Context) {
  if (error instanceof HttpError) {
    c.status(error.status as never);
    return c.json({ error: error.message });
  }
  throw error;
}
