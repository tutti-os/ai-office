import { useEffect } from "react";
import type { LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { fetchBootstrapSnapshot, fetchLocalAgentProviders, fetchOfficeCliStatus, fetchTemplates } from "../api/runtime";
import { normalizeTemplates, type TuttiTemplate } from "../templates/tuttiTemplates";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type DocumentWorkbenchBootstrapInput = {
  setError: (value: string) => void;
  setLocalAgentProviders: StateSetter<LocalAgentProviderStatus[]>;
  setOfficeCliStatus: StateSetter<OfficeCliStatus | null>;
  setRuntimeProfiles: StateSetter<RuntimeProfile[]>;
  setSelectedRuntimeProfileId: StateSetter<string>;
  setTemplates: StateSetter<TuttiTemplate[]>;
};

export function useDocumentWorkbenchBootstrap(input: DocumentWorkbenchBootstrapInput) {
  const {
    setError,
    setLocalAgentProviders,
    setOfficeCliStatus,
    setRuntimeProfiles,
    setSelectedRuntimeProfileId,
    setTemplates,
  } = input;

  useEffect(() => {
    let cancelled = false;
    const officeCliFallback: OfficeCliStatus = {
      available: false,
      source: "missing",
      canInstall: true,
      installing: false,
      reason: "Unable to check OfficeCLI status.",
    };
    void Promise.all([
      fetchBootstrapSnapshot(),
      fetchLocalAgentProviders(),
      fetchTemplates(),
      fetchOfficeCliStatus().catch((error) => ({
        officecli: {
          ...officeCliFallback,
          reason: error instanceof Error ? error.message : String(error),
        },
      })),
    ])
      .then(([snapshot, providerStatus, libraryTemplates, officeCli]) => {
        if (cancelled) return;
        const enabledProfiles = snapshot.runtimeProfiles.filter((profile) => profile.enabled && profile.kind === "local-agent");
        setRuntimeProfiles(enabledProfiles);
        setLocalAgentProviders(providerStatus.providers);
        setTemplates(normalizeTemplates(libraryTemplates));
        setOfficeCliStatus(officeCli.officecli);
        setSelectedRuntimeProfileId((current) => {
          if (enabledProfiles.some((profile) => profile.id === current)) return current;
          return "";
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [setError, setLocalAgentProviders, setOfficeCliStatus, setRuntimeProfiles, setSelectedRuntimeProfileId, setTemplates]);
}
