import { randomUUID } from "node:crypto";
import type { StreamEvent, WsServerMessage } from "@ai-app/shared/types";
import { json, parseJson, rowOrNull, rows } from "@ai-app/shared/project-store";

type SocketLike = {
  send(data: string): void;
};

type DbLike = {
  prepare(sql: string): {
    run(...args: unknown[]): unknown;
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown;
  };
};

export class EventHub<TEventType extends string = string> {
  private readonly clients = new Set<SocketLike>();
  private readonly getDb: () => DbLike;

  constructor(getDb: () => DbLike) {
    this.getDb = getDb;
  }

  addClient(socket: SocketLike) {
    this.clients.add(socket);
    return () => this.clients.delete(socket);
  }

  emit(input: {
    type: TEventType;
    projectId?: string | null;
    runId?: string | null;
    payload: unknown;
  }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const db = this.getDb();
    db.prepare(
      `INSERT INTO stream_events (id, type, project_id, run_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, input.type, input.projectId ?? null, input.runId ?? null, json(input.payload), now);
    const row = rowOrNull<StreamEventRow<TEventType>>(db.prepare(`SELECT * FROM stream_events WHERE id = ?`).get(id));
    if (!row) throw new Error("Unable to create stream event");
    const event = rowToStreamEvent(row);
    const message: WsServerMessage<TEventType> = { type: "event", event };
    for (const client of this.clients) {
      try {
        client.send(JSON.stringify(message));
      } catch {
        this.clients.delete(client);
      }
    }
    return event;
  }

  replaySince(lastSeq: number) {
    const eventRows = rows<StreamEventRow<TEventType>>(
      this.getDb()
        .prepare(`SELECT * FROM stream_events WHERE seq > ? ORDER BY seq ASC LIMIT 500`)
        .all(Math.max(0, Math.trunc(lastSeq))),
    );
    return eventRows.map(rowToStreamEvent);
  }

  lastSeq() {
    return (this.getDb().prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq;
  }
}

interface StreamEventRow<TEventType extends string> {
  id: string;
  seq: number;
  type: TEventType;
  project_id: string | null;
  run_id: string | null;
  payload: string;
  created_at: string;
}

function rowToStreamEvent<TEventType extends string>(row: StreamEventRow<TEventType>): StreamEvent<TEventType> {
  return {
    id: row.id,
    seq: row.seq,
    type: row.type,
    projectId: row.project_id,
    runId: row.run_id,
    payload: parseJson(row.payload, null),
    createdAt: row.created_at,
  };
}
