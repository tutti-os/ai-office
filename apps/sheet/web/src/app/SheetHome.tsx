import { useRef, type ReactNode } from "react";
import { Check, CornerDownLeft, Download, FileSpreadsheet, History, Loader2, Sparkles, Upload } from "lucide-react";
import type { OfficeCliStatus, SheetProject } from "@ai-sheet/shared";
import { PromptComposer } from "@ai-app/ui/prompt-composer";
import {
  appShell,
  ArtifactHistoryPanel,
  formatOptionClass,
  formatOptionIconClass,
  homeContentClass,
  homeHeroSectionClass,
  HomePageShell,
  HomeSectionHeader,
  homeTitleClass,
  HomeTopAction,
  homeWorkSectionClass,
} from "@ai-app/ui/app-shell";

export function SheetHome(props: {
  projects: SheetProject[];
  loading: boolean;
  error: string;
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  prompt: string;
  onClearHistory: () => void;
  onCreateWorkbook: () => void;
  onDeleteProject: (projectId: string) => void;
  onImportFile: (file: File) => void;
  onInstallOfficeCli: () => void;
  onOpenProject: (project: SheetProject) => void;
  onPromptChange: (value: string) => void;
}) {
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
      <HomeTopAction disabled={props.loading || workbookUnavailable} icon={<Upload size={14} />} onClick={openImportPicker}>
        Import
      </HomeTopAction>
      <div className={homeContentClass}>
        <section className={homeHeroSectionClass}>
          <h1 className={homeTitleClass}>Create a workbook</h1>
          <SheetComposer
            canCreate={canCreate}
            disabled={workbookUnavailable}
            error={props.error}
            loading={props.loading}
            officeCliInstalling={officeCliInstalling}
            officeCliStatus={props.officeCliStatus}
            prompt={props.prompt}
            onCreate={props.onCreateWorkbook}
            onImport={openImportPicker}
            onInstallOfficeCli={props.onInstallOfficeCli}
            onPromptChange={props.onPromptChange}
          />
        </section>

        <section className={homeWorkSectionClass}>
          <HomeSectionHeader
            countText={`${props.projects.length} workbooks`}
            icon={<History size={15} />}
            label="Recent"
          />
          <ArtifactHistoryPanel
            emptyDescription="Create or import an XLSX workbook to see it here."
            emptyIcon={<History size={17} />}
            emptyTitle="No workbooks yet"
            getId={(project) => project.id}
            getSubtitle={() => "XLSX workbook"}
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
  canCreate: boolean;
  disabled: boolean;
  error: string;
  loading: boolean;
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  prompt: string;
  onCreate: () => void;
  onImport: () => void;
  onInstallOfficeCli: () => void;
  onPromptChange: (value: string) => void;
}) {
  return (
    <div className={cn(appShell.promptFrame, "!mt-6")}>
      <div className={cn(appShell.promptInner, "!p-3.5")}>
        <PromptComposer
          canSubmit={props.canCreate}
          className={cn(appShell.promptComposer, "!p-3")}
          disabled={props.disabled}
          footerClassName="flex-wrap gap-2.5 pt-1"
          leadingActionsClassName="mr-auto"
          placeholder={formatPromptPlaceholder(props.officeCliStatus, props.officeCliInstalling)}
          textareaClassName={cn("block !h-[84px] pb-2", appShell.promptTextarea)}
          value={props.prompt}
          beforeTextarea={
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <FormatOption
                active
                description={formatXlsxDescription(props.officeCliStatus, props.officeCliInstalling)}
                disabled={props.disabled}
                downloadLabel="Download OfficeCLI"
                icon={<FileSpreadsheet size={20} />}
                installing={props.officeCliInstalling}
                label="XLSX"
                showInstall={props.officeCliStatus?.available !== true && props.officeCliStatus?.canInstall === true}
                title={props.officeCliStatus?.available === true ? undefined : props.officeCliStatus?.reason ?? "OfficeCLI is required for XLSX workbooks"}
                onInstall={props.onInstallOfficeCli}
              />
              <FormatOption
                description="AI-native spreadsheet"
                disabled
                icon={<Sparkles size={20} />}
                label="Smart Sheet"
                statusLabel="Coming soon"
              />
            </div>
          }
          leadingActions={
            <button
              className={appShell.iconAction}
              type="button"
              disabled={props.loading || props.disabled}
              title="Import XLSX"
              aria-label="Import XLSX"
              onClick={props.onImport}
            >
              <Upload size={20} />
            </button>
          }
          trailingActions={
            <button
              className={cn(appShell.submitAction, "inline-flex min-w-[108px] items-center justify-center gap-2 border-0 px-[18px] text-[13px] font-medium")}
              type="button"
              disabled={!props.canCreate}
              title="Create workbook"
              onClick={props.onCreate}
            >
              {props.loading ? <Loader2 className="animate-spin" size={18} /> : <CornerDownLeft size={18} />}
              Create
            </button>
          }
          onChange={props.onPromptChange}
          onSubmit={props.onCreate}
        />
        {props.error ? <div className={appShell.error}>{props.error}</div> : null}
      </div>
    </div>
  );
}

function FormatOption(props: {
  active?: boolean;
  description: string;
  disabled?: boolean;
  downloadLabel?: string;
  icon: ReactNode;
  installing?: boolean;
  label: string;
  showInstall?: boolean;
  statusLabel?: string;
  title?: string;
  onInstall?: () => void;
}) {
  const active = props.active === true;
  return (
    <div
      className={cn(formatOptionClass(active, props.disabled), "!min-h-[56px] !px-3 !py-2.5")}
      aria-disabled={props.disabled ? true : undefined}
      title={props.title}
    >
      <span className={formatOptionIconClass(active, props.disabled)}>{props.icon}</span>
      <span className="mr-auto grid min-w-0 flex-1 gap-1">
        <span className="truncate text-[14px] font-bold leading-none">{props.label}</span>
        <small className={cn("truncate text-[12px] font-medium", active ? "text-[#8B8275]" : props.disabled ? "text-[#8B8275]/72" : "text-[#8B8275]")}>
          {props.description}
        </small>
      </span>
      {props.installing ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
          <Loader2 className="animate-spin" size={14} />
        </span>
      ) : props.showInstall ? (
        <button
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-[16px] border border-[#B8A07C]/35 bg-[#D8CDB9]/50 text-[#8B8275] hover:border-[#5C6B50]/40 hover:text-[#5C6B50] disabled:cursor-wait disabled:opacity-60"
          type="button"
          title={props.downloadLabel}
          aria-label={props.downloadLabel}
          onClick={(event) => {
            event.stopPropagation();
            props.onInstall?.();
          }}
        >
          <Download size={14} />
        </button>
      ) : active ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
          <Check size={14} />
        </span>
      ) : props.statusLabel ? (
        <span className="ml-auto shrink-0 rounded-full border border-[#B8A07C]/35 bg-[#D8CDB9]/50 px-2.5 py-1 text-[11px] font-medium text-[#8B8275]">
          {props.statusLabel}
        </span>
      ) : null}
    </div>
  );
}

function formatXlsxDescription(officeCliStatus: OfficeCliStatus | null, installing: boolean) {
  if (!officeCliStatus) return "Checking OfficeCLI";
  if (installing) return "Installing OfficeCLI";
  if (officeCliStatus.available) return officeCliStatus.version ? `OfficeCLI ${officeCliStatus.version}` : "OfficeCLI ready";
  return "Available after installing OfficeCLI";
}

function formatPromptPlaceholder(officeCliStatus: OfficeCliStatus | null, installing: boolean) {
  if (!officeCliStatus) return "Checking OfficeCLI...";
  if (installing) return "Installing OfficeCLI...";
  if (!officeCliStatus.available) return "Install OfficeCLI to create XLSX workbooks";
  return "Describe the workbook to create...";
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
