import { useCallback, useEffect, useState } from "react";
import type { SlideRunTimelineItem } from "@ai-slide/shared";
import { listProjectRuns } from "../api/projects";

export function useAgentConversation(projectId: string | null) {
  const [items, setItems] = useState<SlideRunTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setItems(await listProjectRuns(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    items,
    loading,
    error,
    reload,
  };
}
