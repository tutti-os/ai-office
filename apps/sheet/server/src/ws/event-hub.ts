import { randomUUID } from "node:crypto";
import type { StreamEvent, StreamEventType } from "@ai-sheet/shared";
import { getDb, json, parseJson, rows } from "../db/database.js";

export class EventHub {
  private readonly sockets = new Set<any>();

  addClient(socket: unknown) {
    const client = socket as { send: (message: string) => void };
    this.sockets.add(client);
    return () => {
      this.sockets.delete(client);
    };
  }

  emit(input: {
    type: StreamEventType;
    projectId?: string | null;
    runId?: string | null;
    payload: unknown;
  }) {
    const event = this.persist(input);
    const message = JSON.stringify({ type: "event", event });
    for (const socket of this.sockets) {
      try {
        socket.send(message);
      } catch {
        this.sockets.delete(socket);
      }
    }
    return event;
  }

  lastSeq() {
    return (getDb().prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq;
  }

  replaySince(seq: number) {
    return rows<StreamEventRow>(
      getDb().prepare(`SELECT * FROM stream_events WHERE seq > ? ORDER BY seq ASC LIMIT 300`).all(seq),
    ).map(rowToEvent);
  }

  private persist(input: {
    type: StreamEventType;
    projectId?: string | null;
    runId?: string | null;
    payload: unknown;
  }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO stream_events (id, type, project_id, run_id, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.type, input.projectId ?? null, input.runId ?? null, json(input.payload), now);
    const row = getDb().prepare(`SELECT * FROM stream_events WHERE id = ?`).get(id) as StreamEventRow;
    return rowToEvent(row);
  }
}

type StreamEventRow = {
  id: string;
  seq: number;
  type: StreamEventType;
  project_id: string | null;
  run_id: string | null;
  payload: string;
  created_at: string;
};

function rowToEvent(row: StreamEventRow): StreamEvent {
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
