import { useEffect } from "react";
import { isAvailableLocalAgentRuntimeProfileId, mergeLocalAgentRuntimeProfiles, resolvePreferredLocalAgentRuntimeProfileId } from "@ai-app/shared/agent-providers";
import type { LocalAgentTargetStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { fetchBootstrapSnapshot, fetchLocalAgentTargets, fetchOfficeCliStatus, fetchTemplates } from "../api/runtime";
import { normalizeTemplates, type TuttiTemplate } from "../templates/tuttiTemplates";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type DocumentWorkbenchBootstrapInput = {
  setError: (value: string) => void;
  setLocalAgentTargets: StateSetter<LocalAgentTargetStatus[]>;
  setOfficeCliStatus: StateSetter<OfficeCliStatus | null>;
  setParentPath: StateSetter<string>;
  setRuntimeProfiles: StateSetter<RuntimeProfile[]>;
  setSelectedRuntimeProfileId: StateSetter<string>;
  setTemplates: StateSetter<TuttiTemplate[]>;
  setTshWorkspaceApp: StateSetter<boolean>;
};

export function useDocumentWorkbenchBootstrap(input: DocumentWorkbenchBootstrapInput) {
  const {
    setError,
    setLocalAgentTargets,
    setOfficeCliStatus,
    setParentPath,
    setRuntimeProfiles,
    setSelectedRuntimeProfileId,
    setTemplates,
    setTshWorkspaceApp,
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
      fetchLocalAgentTargets(),
      fetchTemplates(),
      fetchOfficeCliStatus().catch((error) => ({
        officecli: {
          ...officeCliFallback,
          reason: error instanceof Error ? error.message : String(error),
        },
      })),
    ])
      .then(([snapshot, targetStatus, libraryTemplates, officeCli]) => {
        if (cancelled) return;
        const enabledProfiles = snapshot.runtimeProfiles.filter((profile) => profile.enabled && profile.kind === "local-agent");
        const mergedProfiles = mergeLocalAgentRuntimeProfiles(enabledProfiles, targetStatus.agents);
        setRuntimeProfiles(mergedProfiles);
        setLocalAgentTargets(targetStatus.agents);
        setTemplates(normalizeTemplates(libraryTemplates));
        setOfficeCliStatus(officeCli.officecli);
        setTshWorkspaceApp(snapshot.tshWorkspaceApp === true);
        if (snapshot.tshWorkspaceApp === true) {
          setParentPath(snapshot.defaultParentPath?.trim() || "/workspace");
        }
        setSelectedRuntimeProfileId((current) => {
          if (isAvailableLocalAgentRuntimeProfileId(current, mergedProfiles, targetStatus.agents)) return current;
          return resolvePreferredLocalAgentRuntimeProfileId({
            profiles: mergedProfiles,
            agents: targetStatus.agents,
          });
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [setError, setLocalAgentTargets, setOfficeCliStatus, setParentPath, setRuntimeProfiles, setSelectedRuntimeProfileId, setTemplates, setTshWorkspaceApp]);
}
