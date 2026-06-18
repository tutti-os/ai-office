import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectDetailResponse, SlideRunTimelineItem, StreamEvent, WsServerMessage } from "@ai-slide/shared";
import { getProject, listProjectRuns } from "../api/projects";
import { mergeStreamEvent } from "./agentConversation";

type UseAgentConversationInput = {
  projectId: string | null;
  onProjectUpdated: (detail: ProjectDetailResponse) => void;
};

export function useAgentConversation(input: UseAgentConversationInput) {
  const [items, setItems] = useState<SlideRunTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const projectUpdatedRef = useRef(input.onProjectUpdated);

  useEffect(() => {
    projectUpdatedRef.current = input.onProjectUpdated;
  }, [input.onProjectUpdated]);

  const reload = useCallback(async () => {
    if (!input.projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setItems(await listProjectRuns(input.projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [input.projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!input.projectId) return undefined;
    let closed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSeq = 0;

    const refreshProject = () => {
      if (!input.projectId) return;
      void getProject(input.projectId)
        .then((detail) => projectUpdatedRef.current(detail))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    };

    const handleStreamEvent = (event: StreamEvent) => {
      lastSeq = Math.max(lastSeq, event.seq);
      if (event.projectId !== input.projectId) return;
      if (event.type === "project.updated") refreshProject();
      setItems((current) => {
        const update = mergeStreamEvent(current, event, input.projectId ?? "");
        if (update.kind === "project") {
          projectUpdatedRef.current(update.project);
          return current;
        }
        return update.items;
      });
    };

    const connect = () => {
      if (closed) return;
      socket = new WebSocket(createWsUrl("/api/ws"));
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
          handleStreamEvent(parsed.event);
          return;
        }
        for (const event of parsed.events) handleStreamEvent(event);
      });
      socket.addEventListener("close", () => {
        if (closed) return;
        reconnectTimer = setTimeout(connect, 900);
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
