import { useRef } from "react";
import { FileSpreadsheet, History, Sparkles, Upload } from "lucide-react";
import type { LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile, SheetProject } from "@ai-sheet/shared";
import { contextAttachmentFileAccept } from "@ai-app/shared/context-attachments";
import { ArtifactHomeComposer, type ArtifactHomeFormatOption } from "@ai-app/ui/home-composer";
import {
  ArtifactHistoryPanel,
  homeContentClass,
  homeHeroSectionClass,
  HomePageShell,
  HomeSectionHeader,
  homeTitleClass,
  HomeTopAction,
  homeWorkSectionClass,
} from "@ai-app/ui/app-shell";
import { artifactHistoryCopy } from "../i18n/copy";
import { useI18n } from "../i18n";
import type { HomeAttachment } from "./useHomeAttachments";

export function SheetHome(props: {
  attachments: HomeAttachment[];
  projects: SheetProject[];
  loading: boolean;
  error: string;
  localAgentProviders: LocalAgentProviderStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  prompt: string;
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  onAddFiles: (files: File[]) => void;
  onClearHistory: () => void;
  onCreateWorkbook: () => void;
  onDeleteProject: (projectId: string) => void;
  onImportFile: (file: File) => void;
  onInstallOfficeCli: () => void;
  onOpenProject: (project: SheetProject) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRuntimeProfileChange: (profileId: string) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openImportPicker = () => inputRef.current?.click();
  const officeCliReady = props.officeCliStatus?.available === true;
  const officeCliInstalling = props.officeCliInstalling || props.officeCliStatus?.installing === true;
  const workbookUnavailable = !officeCliReady || officeCliInstalling;
  const canCreate = !props.loading && !workbookUnavailable;

  return (
    <HomePageShell>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onImportFile(file);
        }}
      />
      <HomeTopAction disabled={props.loading || workbookUnavailable} icon={<Upload size={14} />} title={t("home.importTitle")} onClick={openImportPicker}>
        {t("home.import")}
      </HomeTopAction>
      <div className={homeContentClass}>
        <section className={homeHeroSectionClass}>
          <h1 className={homeTitleClass}>{t("home.heading")}</h1>
          <SheetComposer
            attachments={props.attachments}
            canCreate={canCreate}
            disabled={workbookUnavailable}
            error={props.error}
            loading={props.loading}
            officeCliInstalling={officeCliInstalling}
            officeCliStatus={props.officeCliStatus}
            prompt={props.prompt}
            localAgentProviders={props.localAgentProviders}
            runtimeProfiles={props.runtimeProfiles}
            selectedRuntimeProfileId={props.selectedRuntimeProfileId}
            onAddFiles={props.onAddFiles}
            onCreate={props.onCreateWorkbook}
            onInstallOfficeCli={props.onInstallOfficeCli}
            onPromptChange={props.onPromptChange}
            onRemoveAttachment={props.onRemoveAttachment}
            onRuntimeProfileChange={props.onRuntimeProfileChange}
          />
        </section>

        <section className={homeWorkSectionClass}>
          <HomeSectionHeader
            countText={t("home.workbookCount", { count: props.projects.length })}
            icon={<History size={15} />}
            label={t("home.recent")}
          />
          <ArtifactHistoryPanel
            copy={artifactHistoryCopy(t)}
            emptyDescription={t("history.emptyDescription")}
            emptyIcon={<History size={17} />}
            emptyTitle={t("history.noHistory")}
            getId={(project) => project.id}
            getSubtitle={() => t("history.typeXlsx")}
            getTitle={(project) => project.title}
            getUpdatedAt={(project) => project.updatedAt}
            icon={<FileSpreadsheet size={15} />}
            loading={props.loading}
            projects={props.projects}
            onClearHistory={props.onClearHistory}
            onDeleteProject={props.onDeleteProject}
            onOpenProject={props.onOpenProject}
          />
        </section>
      </div>
    </HomePageShell>
  );
}

function SheetComposer(props: {
  attachments: HomeAttachment[];
  canCreate: boolean;
  disabled: boolean;
  error: string;
  loading: boolean;
  localAgentProviders: LocalAgentProviderStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  prompt: string;
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  onAddFiles: (files: File[]) => void;
  onCreate: () => void;
  onInstallOfficeCli: () => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRuntimeProfileChange: (profileId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <ArtifactHomeComposer
      addFilesLabel={t("composer.addContext")}
      agentProfiles={props.runtimeProfiles}
      agentProviders={props.localAgentProviders}
      agentUnavailableLabel={t("composer.agentUnavailable")}
      acceptedFileTypes={contextAttachmentFileAccept}
      attachments={props.attachments}
      canSubmit={props.canCreate}
      error={props.error}
      formatOptions={sheetFormatOptions({
        disabled: props.disabled,
        installing: props.officeCliInstalling,
        officeCliStatus: props.officeCliStatus,
        t,
        onInstallOfficeCli: props.onInstallOfficeCli,
      })}
      loading={props.loading}
      multipleFiles={false}
      placeholder={formatPromptPlaceholder(props.officeCliStatus, props.officeCliInstalling, t)}
      prompt={props.prompt}
      selectedAgentId={props.selectedRuntimeProfileId}
      selectedFormatId="xlsx"
      selectAgentLabel={t("composer.selectAgent")}
      submitLabel={t("composer.create")}
      onAddFiles={props.onAddFiles}
      onFormatChange={() => undefined}
      onPromptChange={props.onPromptChange}
      onRemoveAttachment={props.onRemoveAttachment}
      onSelectedAgentChange={props.onRuntimeProfileChange}
      onSubmit={props.onCreate}
    />
  );
}

function sheetFormatOptions(input: {
  disabled: boolean;
  installing: boolean;
  officeCliStatus: OfficeCliStatus | null;
  t: ReturnType<typeof useI18n>["t"];
  onInstallOfficeCli: () => void;
}): ArtifactHomeFormatOption<"xlsx" | "smart-sheet">[] {
  return [
    {
      id: "xlsx",
      label: "XLSX",
      description: formatXlsxDescription(input.officeCliStatus, input.installing, input.t),
      disabled: input.disabled,
      downloadLabel: input.t("composer.downloadOfficeCli"),
      icon: <FileSpreadsheet size={20} />,
      installing: input.installing,
      showInstall: input.officeCliStatus?.available !== true && input.officeCliStatus?.canInstall === true,
      title: input.officeCliStatus?.available === true ? undefined : input.officeCliStatus?.reason ?? input.t("composer.officeCliRequired"),
      onInstall: input.onInstallOfficeCli,
    },
    {
      id: "smart-sheet",
      label: "Smart Sheet",
      description: input.t("composer.smartSheetDescription"),
      disabled: true,
      icon: <Sparkles size={20} />,
      statusLabel: input.t("composer.comingSoon"),
    },
  ];
}

function formatXlsxDescription(officeCliStatus: OfficeCliStatus | null, installing: boolean, t: ReturnType<typeof useI18n>["t"]) {
  if (!officeCliStatus) return t("composer.checkingOfficeCli");
  if (installing) return t("composer.installingOfficeCli");
  if (officeCliStatus.available) return officeCliStatus.version ? `OfficeCLI ${officeCliStatus.version}` : t("composer.officeCliReady");
  return t("composer.officeCliInstallRequired");
}

function formatPromptPlaceholder(officeCliStatus: OfficeCliStatus | null, installing: boolean, t: ReturnType<typeof useI18n>["t"]) {
  if (!officeCliStatus) return t("composer.checkingOfficeCliPlaceholder");
  if (installing) return t("composer.installingOfficeCliPlaceholder");
  if (!officeCliStatus.available) return t("composer.installOfficeCliPlaceholder");
  return t("composer.placeholder");
}
