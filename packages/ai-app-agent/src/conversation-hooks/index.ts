import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseRun, BaseRunEvent, BaseRunTimelineItem, StreamEvent, WsServerMessage } from "@ai-app/shared/types";
import type { ProjectTimelineUpdate } from "@ai-app/agent/conversation";

export type RunTimelineStreamInput<
  TProject,
  TRun extends BaseRun,
  TEvent extends BaseRunEvent,
  TStreamEvent extends StreamEvent = StreamEvent,
  TItem extends BaseRunTimelineItem<TRun, TEvent> = BaseRunTimelineItem<TRun, TEvent>,
> = {
  projectId: string | null;
  listProjectRuns: (projectId: string) => Promise<TItem[]>;
  mergeStreamEvent: (items: TItem[], event: TStreamEvent, projectId: string) => ProjectTimelineUpdate<TProject, TRun, TEvent>;
  onProjectUpdated: (project: TProject) => void;
  hydrateProject?: (projectId: string) => Promise<TProject>;
  shouldHydrateProject?: (event: TStreamEvent) => boolean;
  wsPath?: string;
  reconnectDelayMs?: number;
};

export function useRunTimelineStream<
  TProject,
  TRun extends BaseRun,
  TEvent extends BaseRunEvent,
  TStreamEvent extends StreamEvent = StreamEvent,
  TItem extends BaseRunTimelineItem<TRun, TEvent> = BaseRunTimelineItem<TRun, TEvent>,
>(input: RunTimelineStreamInput<TProject, TRun, TEvent, TStreamEvent, TItem>) {
  const [items, setItems] = useState<TItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const projectUpdatedRef = useRef(input.onProjectUpdated);
  const inputRef = useRef(input);

  useEffect(() => {
    projectUpdatedRef.current = input.onProjectUpdated;
    inputRef.current = input;
  }, [input]);

  const reload = useCallback(async () => {
    const projectId = input.projectId;
    if (!projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const snapshot = await input.listProjectRuns(projectId);
      setItems((current) => mergeTimelineSnapshot(current, snapshot, projectId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [input.projectId, input.listProjectRuns]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!input.projectId) return undefined;
    const hasActiveRun = items.some((item) => item.run.status === "accepted" || item.run.status === "running");
    if (!hasActiveRun) return undefined;
    const timer = window.setInterval(() => void reload(), 2500);
    return () => window.clearInterval(timer);
  }, [input.projectId, items, reload]);

  useEffect(() => {
    if (!input.projectId) return undefined;
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSeq = 0;

    const refreshProject = (projectId: string) => {
      const current = inputRef.current;
      if (!current.hydrateProject) return;
      void current.hydrateProject(projectId).then(projectUpdatedRef.current).catch((err) => setError(errorMessage(err)));
    };

    const reconcileFromServer = (projectId: string) => {
      const current = inputRef.current;
      void current
        .listProjectRuns(projectId)
        .then((snapshot) => {
          if (closed || inputRef.current.projectId !== projectId) return;
          setItems((itemsCurrent) => mergeTimelineSnapshot(itemsCurrent, snapshot, projectId));
        })
        .catch((err) => setError(errorMessage(err)));
      refreshProject(projectId);
    };

    const handleStreamEvent = (event: TStreamEvent) => {
      lastSeq = Math.max(lastSeq, event.seq);
      const current = inputRef.current;
      const projectId = current.projectId;
      if (!projectId || event.projectId !== projectId) return;
      if (current.shouldHydrateProject?.(event)) refreshProject(projectId);
      setItems((itemsCurrent) => {
        const update = current.mergeStreamEvent(itemsCurrent, event, projectId);
        if (update.kind === "project") {
          projectUpdatedRef.current(update.project);
          return itemsCurrent;
        }
        return update.items as TItem[];
      });
    };

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(createWsUrl(inputRef.current.wsPath ?? "/api/ws"));
      socket.addEventListener("open", () => {
        socket?.send(JSON.stringify({ type: "hello", lastSeq }));
        const projectId = inputRef.current.projectId;
        if (projectId) reconcileFromServer(projectId);
      });
      socket.addEventListener("message", (message) => {
        const parsed = parseWsMessage(message.data);
        if (!parsed) return;
        if (parsed.type === "hello") {
          lastSeq = Math.max(lastSeq, parsed.lastSeq);
          return;
        }
        if (parsed.type === "event") {
          handleStreamEvent(parsed.event as TStreamEvent);
          return;
        }
        for (const event of parsed.events) handleStreamEvent(event as TStreamEvent);
      });
      socket.addEventListener("close", () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, inputRef.current.reconnectDelayMs ?? 900);
      });
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [input.projectId]);

  return {
    items,
    loading,
    error,
    reload,
  };
}

function createWsUrl(path: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function parseWsMessage(value: unknown): WsServerMessage | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as WsServerMessage;
    return parsed && typeof parsed === "object" && "type" in parsed ? parsed : null;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function mergeTimelineSnapshot<TRun extends BaseRun, TEvent extends BaseRunEvent, TItem extends BaseRunTimelineItem<TRun, TEvent>>(
  currentItems: TItem[],
  snapshotItems: TItem[],
  projectId: string,
) {
  const currentForProject = currentItems.filter((item) => item.run.projectId === projectId);
  const byRunId = new Map<string, BaseRunTimelineItem<TRun, TEvent>>();

  for (const item of snapshotItems) {
    byRunId.set(item.run.id, {
      run: item.run,
      events: dedupeRunEvents(item.events),
    });
  }

  for (const item of currentForProject) {
    const existing = byRunId.get(item.run.id);
    if (!existing) {
      byRunId.set(item.run.id, {
        run: item.run,
        events: dedupeRunEvents(item.events),
      });
      continue;
    }

    byRunId.set(item.run.id, {
      run: newerRun(existing.run, item.run),
      events: dedupeRunEvents([...existing.events, ...item.events]),
    });
  }

  return Array.from(byRunId.values()).sort(sortTimelineItems) as TItem[];
}

function newerRun<TRun extends BaseRun>(first: TRun, second: TRun) {
  return runTimeValue(second) > runTimeValue(first) ? second : first;
}

function runTimeValue(run: BaseRun) {
  return Date.parse(run.updatedAt || run.createdAt) || 0;
}

function dedupeRunEvents<TEvent extends BaseRunEvent>(events: TEvent[]) {
  const byId = new Map<string, TEvent>();
  for (const event of events) byId.set(event.id, event);
  return Array.from(byId.values()).sort(sortRunEvents);
}

function sortTimelineItems<TRun extends BaseRun, TEvent extends BaseRunEvent>(a: BaseRunTimelineItem<TRun, TEvent>, b: BaseRunTimelineItem<TRun, TEvent>) {
  return a.run.createdAt.localeCompare(b.run.createdAt) || a.run.id.localeCompare(b.run.id);
}

function sortRunEvents(a: BaseRunEvent, b: BaseRunEvent) {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
