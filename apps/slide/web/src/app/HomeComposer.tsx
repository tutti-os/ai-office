import { Check, ChevronDown, Download, FileCode2, FileText, Loader2, Plus, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { AgentSelectShell, appShell, formatOptionClass, formatOptionIconClass } from "@ai-app/ui/app-shell";
import { PromptComposer } from "@ai-app/ui/prompt-composer";
import type { LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-slide/shared";
import { useI18n } from "../i18n";
import type { OutputType } from "../templates";

export function HomeComposer(props: {
  creating: boolean;
  localAgentProviders: LocalAgentProviderStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  outputType: OutputType;
  prompt: string;
  runtimeProfiles: RuntimeProfile[];
  selectedAgent: string;
  onCreate: () => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: OutputType) => void;
  onPromptChange: (value: string) => void;
  onSelectedAgentChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const pptxAvailable = props.officeCliStatus?.available === true;
  const pptxInstalling = props.officeCliInstalling || props.officeCliStatus?.installing === true;
  const selectedOutputAvailable = props.outputType !== "pptx" || pptxAvailable;
  const canSubmit = props.prompt.trim().length > 0 && !props.creating && selectedOutputAvailable;

  return (
    <div className={cn(appShell.promptFrame, "!mt-6")}>
      <div className={cn(appShell.promptInner, "!p-3.5")}>
        <PromptComposer
          canSubmit={canSubmit}
          className={cn(appShell.promptComposer, "!p-3")}
          footerClassName="flex-wrap gap-2.5 pt-1"
          leadingActionsClassName="mr-auto flex-1 basis-[204px] flex-wrap gap-2.5 md:flex-none md:basis-auto"
          placeholder={t("composer.placeholder")}
          textareaClassName={cn("block !h-[84px] pb-2", appShell.promptTextarea)}
          value={props.prompt}
          beforeTextarea={
            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <FormatOption
                active={props.outputType === "html"}
                description={t("composer.deckDescription")}
                icon={<FileCode2 size={20} />}
                label="Deck"
                onClick={() => props.onOutputTypeChange("html")}
              />
              <FormatOption
                active={props.outputType === "pptx"}
                description={formatPptxOutputDescription(props.officeCliStatus, t)}
                disabled={!pptxAvailable || pptxInstalling}
                downloadLabel={t("composer.downloadOfficeCli")}
                icon={<FileText size={20} />}
                installing={pptxInstalling}
                label="PPTX"
                showInstall={!pptxAvailable && props.officeCliStatus?.canInstall === true}
                title={!pptxAvailable ? props.officeCliStatus?.reason ?? t("composer.officeCliRequired") : undefined}
                onInstall={props.onInstallOfficeCli}
                onClick={() => props.onOutputTypeChange("pptx")}
              />
            </div>
          }
          leadingActions={
            <>
              <button className={appShell.iconAction} type="button" title={t("composer.addSourceFiles")}>
                <Plus size={20} />
              </button>
              <AgentMenu
                localAgentProviders={props.localAgentProviders}
                runtimeProfiles={props.runtimeProfiles}
                selectedAgent={props.selectedAgent}
                onChange={props.onSelectedAgentChange}
              />
            </>
          }
          trailingActions={
            <button className={cn(appShell.submitAction, "inline-flex min-w-[108px] flex-1 items-center justify-center gap-2 border-0 px-[18px] text-[13px] font-medium md:flex-none")} disabled={!canSubmit} type="button" title={t("composer.createDeck")} onClick={props.onCreate}>
              {props.creating ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
              {t("composer.create")}
            </button>
          }
          trailingActionsClassName="flex-1 md:flex-none"
          onChange={props.onPromptChange}
          onSubmit={props.onCreate}
        />
      </div>
    </div>
  );
}

function formatPptxOutputDescription(officeCliStatus: OfficeCliStatus | null, t: ReturnType<typeof useI18n>["t"]) {
  if (!officeCliStatus) return t("composer.checkingOfficeCli");
  if (officeCliStatus.installing) return t("composer.installingOfficeCli");
  if (officeCliStatus.available) return officeCliStatus.version ? `OfficeCLI ${officeCliStatus.version}` : t("composer.officeCliReady");
  return t("composer.officeCliInstallRequired");
}

function FormatOption(props: {
  active: boolean;
  description: string;
  disabled?: boolean;
  downloadLabel?: string;
  icon: ReactNode;
  installing?: boolean;
  label: string;
  showInstall?: boolean;
  title?: string;
  onClick: () => void;
  onInstall?: () => void;
}) {
  return (
    <div
      className={cn(formatOptionClass(props.active, props.disabled), "!min-h-[56px] !px-3 !py-2.5")}
      role="button"
      tabIndex={props.disabled && !props.showInstall ? -1 : 0}
      title={props.title}
      onClick={() => {
        if (!props.disabled) props.onClick();
      }}
      onKeyDown={(event) => {
        if (props.disabled || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        props.onClick();
      }}
    >
      <span className={formatOptionIconClass(props.active, props.disabled)}>{props.icon}</span>
      <span className="grid min-w-0 gap-1">
        <span className="truncate text-[14px] font-bold leading-none">{props.label}</span>
        <small className={cn("truncate text-[12px] font-medium", props.active ? "text-[#8B8275]" : props.disabled ? "text-[#8B8275]/78" : "text-[#E6DDCD]/62")}>{props.description}</small>
      </span>
      {props.installing ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
          <Loader2 className="animate-spin" size={14} />
        </span>
      ) : props.active ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
          <Check size={14} />
        </span>
      ) : props.showInstall ? (
        <span
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-[16px] border border-[#B8A07C]/35 bg-[#D8CDB9]/50 text-[#8B8275] hover:border-[#5C6B50]/40 hover:text-[#5C6B50]"
          role="button"
          tabIndex={0}
          title={props.downloadLabel}
          aria-label={props.downloadLabel}
          onClick={(event) => {
            event.stopPropagation();
            if (props.installing) return;
            props.onInstall?.();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            if (props.installing) return;
            props.onInstall?.();
          }}
        >
          {props.installing ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
        </span>
      ) : null}
    </div>
  );
}

function AgentMenu(props: {
  localAgentProviders: LocalAgentProviderStatus[];
  runtimeProfiles: RuntimeProfile[];
  selectedAgent: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <AgentSelectShell>
      <select className="h-full w-full appearance-none rounded-full border border-[#B8A07C]/50 bg-[#F4EFE6]/70 px-4 pr-9 text-[13px] font-medium text-[#2A2620] outline-none hover:border-[#5C6B50]/50 hover:text-[#5C6B50]" value={props.selectedAgent} aria-label={t("composer.selectAgent")} onChange={(event) => props.onChange(event.currentTarget.value)}>
        {props.runtimeProfiles.map((profile) => {
          const status = profile.kind === "local-agent" ? props.localAgentProviders.find((provider) => provider.provider === profile.provider) : null;
          const available = status?.available ?? props.localAgentProviders.length === 0;
          return (
            <option disabled={!available} key={profile.id} value={profile.id}>
              {profile.displayName}{available ? "" : ` ${t("composer.agentUnavailable")}`}
            </option>
          );
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 text-[#8B8275]" size={14} />
    </AgentSelectShell>
  );
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
