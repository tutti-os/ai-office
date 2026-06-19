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
    if (!input.projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setItems(await input.listProjectRuns(input.projectId));
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
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSeq = 0;

    const refreshProject = (projectId: string) => {
      const current = inputRef.current;
      if (!current.hydrateProject) return;
      void current.hydrateProject(projectId).then(projectUpdatedRef.current).catch((err) => setError(errorMessage(err)));
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
