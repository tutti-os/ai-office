import { randomBytes } from "node:crypto";

export class AgentToolUnauthorizedError extends Error {
  constructor(message = "Invalid or expired tool token") {
    super(message);
    this.name = "AgentToolUnauthorizedError";
  }
}

export class AgentToolTokenStore {
  private readonly tokens = new Map<string, { runId: string; projectId: string; expiresAt: string }>();
  private readonly byRun = new Map<string, string>();

  issue(input: { runId: string; projectId: string }) {
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    this.tokens.set(token, { ...input, expiresAt });
    this.byRun.set(input.runId, token);
    return { token, expiresAt };
  }

  verify(token: string | null | undefined, input: { runId?: string | null; projectId?: string | null } = {}) {
    if (!token) throw new AgentToolUnauthorizedError();
    const record = this.tokens.get(token);
    if (!record) throw new AgentToolUnauthorizedError();
    if (Date.parse(record.expiresAt) < Date.now()) {
      this.tokens.delete(token);
      throw new AgentToolUnauthorizedError();
    }
    if (input.runId && input.runId !== record.runId) throw new AgentToolUnauthorizedError();
    if (input.projectId && input.projectId !== record.projectId) throw new AgentToolUnauthorizedError();
    return record;
  }

  revokeRun(runId: string) {
    const token = this.byRun.get(runId);
    if (token) this.tokens.delete(token);
    this.byRun.delete(runId);
  }
}
