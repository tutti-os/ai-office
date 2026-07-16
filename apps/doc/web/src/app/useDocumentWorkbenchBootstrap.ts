import { useCallback, useEffect } from "react";
import { applyLocalAgentCatalogResponse } from "@ai-app/agent/local-agent-catalog";
import type { LocalAgentCatalogResponse, LocalAgentTargetStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { fetchBootstrapSnapshot, fetchLocalAgentTargets, fetchOfficeCliStatus, fetchTemplates } from "../api/runtime";
import { normalizeTemplates, type TuttiTemplate } from "../templates/tuttiTemplates";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type DocumentWorkbenchBootstrapInput = {
  setError: (value: string) => void;
  setLocalAgentTargets: StateSetter<LocalAgentTargetStatus[]>;
  setLocalAgentTargetsLoaded: StateSetter<boolean>;
  setOfficeCliStatus: StateSetter<OfficeCliStatus | null>;
  setRuntimeProfiles: StateSetter<RuntimeProfile[]>;
  setSelectedRuntimeProfileId: StateSetter<string>;
  setTemplates: StateSetter<TuttiTemplate[]>;
};

export function useDocumentWorkbenchBootstrap(input: DocumentWorkbenchBootstrapInput) {
  const {
    setError,
    setLocalAgentTargets,
    setLocalAgentTargetsLoaded,
    setOfficeCliStatus,
    setRuntimeProfiles,
    setSelectedRuntimeProfileId,
    setTemplates,
  } = input;

  const applyCatalog = useCallback((response: LocalAgentCatalogResponse) => {
    setLocalAgentTargets(response.agents);
    setLocalAgentTargetsLoaded(response.source !== "seed" || response.agents.length > 0);
    setRuntimeProfiles((currentProfiles) => {
      setSelectedRuntimeProfileId((currentSelection) => {
        const result = applyLocalAgentCatalogResponse({
          currentProfiles,
          currentSelectedRuntimeProfileId: currentSelection,
          response,
        });
        if (result.notice) setError(result.notice);
        return result.selectedRuntimeProfileId;
      });
      return response.runtimeProfiles;
    });
    if (response.error) setError(response.error);
  }, [setError, setLocalAgentTargets, setLocalAgentTargetsLoaded, setRuntimeProfiles, setSelectedRuntimeProfileId]);

  useEffect(() => {
    let cancelled = false;
    const officeCliFallback: OfficeCliStatus = {
      available: false,
      source: "missing",
      canInstall: true,
      installing: false,
      reason: "Unable to check OfficeCLI status.",
    };
    void fetchBootstrapSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        applyCatalog({ ...snapshot.localAgentCatalog, runtimeProfiles: snapshot.runtimeProfiles });
        void fetchLocalAgentTargets()
          .then((catalog) => {
            if (!cancelled) applyCatalog(catalog);
          })
          .catch((error) => {
            if (!cancelled) {
              setLocalAgentTargetsLoaded(true);
              setError(error instanceof Error ? error.message : String(error));
            }
          });
      })
      .catch((error) => {
        if (!cancelled) setError(error instanceof Error ? error.message : String(error));
      });
    void fetchTemplates()
      .then((libraryTemplates) => {
        if (!cancelled) setTemplates(normalizeTemplates(libraryTemplates));
      })
      .catch((error) => {
        if (!cancelled) setError(error instanceof Error ? error.message : String(error));
      });
    void fetchOfficeCliStatus().catch((error) => ({
        officecli: {
          ...officeCliFallback,
          reason: error instanceof Error ? error.message : String(error),
        },
      }))
      .then((officeCli) => {
        if (!cancelled) {
        setOfficeCliStatus(officeCli.officecli);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applyCatalog, setError, setLocalAgentTargetsLoaded, setOfficeCliStatus, setTemplates]);

  return useCallback(async () => {
    try {
      const catalog = await fetchLocalAgentTargets(true);
      applyCatalog(catalog);
      return catalog;
    } catch (error) {
      setLocalAgentTargetsLoaded(true);
      setError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }, [applyCatalog, setError, setLocalAgentTargetsLoaded]);
}
