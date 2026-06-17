import { nanoid } from "nanoid";
import type { StreamEvent, StreamEventType, WsServerMessage } from "@ai-document/shared";
import { getDb, json, parseJson } from "../db/database.js";

type SocketLike = {
  send(data: string): void;
};

export class EventHub {
  private readonly clients = new Set<SocketLike>();

  addClient(socket: SocketLike) {
    this.clients.add(socket);
    return () => this.clients.delete(socket);
  }

  emit(input: {
    type: StreamEventType;
    projectId?: string | null;
    runId?: string | null;
    payload: unknown;
  }) {
    const id = nanoid();
    const now = new Date().toISOString();
    const db = getDb();
    db.prepare(
      `INSERT INTO stream_events (id, type, project_id, run_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, input.type, input.projectId ?? null, input.runId ?? null, json(input.payload), now);
    const row = rowOrNull<StreamEventRow>(db.prepare(`SELECT * FROM stream_events WHERE id = ?`).get(id));
    if (!row) throw new Error("Unable to create stream event");
    const event = rowToStreamEvent(row);
    const message: WsServerMessage = { type: "event", event };
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
    const eventRows = rows<StreamEventRow>(
      getDb()
      .prepare(`SELECT * FROM stream_events WHERE seq > ? ORDER BY seq ASC LIMIT 500`)
      .all(Math.max(0, Math.trunc(lastSeq))),
    );
    return eventRows.map(rowToStreamEvent);
  }

  lastSeq() {
    return (getDb().prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq;
  }
}

interface StreamEventRow {
  id: string;
  seq: number;
  type: StreamEventType;
  project_id: string | null;
  run_id: string | null;
  payload: string;
  created_at: string;
}

function rowToStreamEvent(row: StreamEventRow): StreamEvent {
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

function rows<TRow>(value: unknown): TRow[] {
  return value as TRow[];
}

function rowOrNull<TRow>(value: unknown): TRow | null {
  return (value ?? null) as TRow | null;
}
