import { Check, ChevronDown, Download, File, FileCode2, FileImage, FileText, Loader2, Plus, Wand2, X } from "lucide-react";
import { useRef, type ChangeEvent, type ReactNode } from "react";
import { AgentSelectShell, appShell } from "@ai-app/ui/app-shell";
import { PromptComposer } from "@ai-app/ui/prompt-composer";
import type { LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-slide/shared";
import { useI18n } from "../i18n";
import type { OutputType } from "../templates";
import type { HomeAttachment } from "./useHomeAttachments";

export function HomeComposer(props: {
  attachments: HomeAttachment[];
  creating: boolean;
  localAgentProviders: LocalAgentProviderStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  outputType: OutputType;
  prompt: string;
  runtimeProfiles: RuntimeProfile[];
  selectedAgent: string;
  onAddFiles: (files: File[]) => void;
  onCreate: () => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: OutputType) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onSelectedAgentChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const pptxAvailable = props.officeCliStatus?.available === true;
  const pptxInstalling = props.officeCliInstalling || props.officeCliStatus?.installing === true;
  const selectedOutputAvailable = props.outputType !== "pptx" || pptxAvailable;
  const canSubmit = (props.prompt.trim().length > 0 || props.attachments.length > 0) && !props.creating && selectedOutputAvailable;

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length > 0) props.onAddFiles(files);
  };

  return (
    <div className={cn(appShell.promptFrame, "!mt-6")}>
      <div className={cn(appShell.promptInner, "!p-3.5")}>
        <input
          ref={importInputRef}
          className="hidden"
          type="file"
          multiple
          onChange={handleFileInputChange}
        />
        <PromptComposer
          canSubmit={canSubmit}
          className={cn(appShell.promptComposer, "!p-3")}
          footerClassName="flex-wrap gap-2.5 pt-1"
          leadingActionsClassName="mr-auto flex-1 basis-[204px] flex-wrap gap-2.5 md:flex-none md:basis-auto"
          placeholder={t("composer.placeholder")}
          textareaClassName={cn("block !h-[84px] pb-2", appShell.promptTextarea)}
          value={props.prompt}
          beforeTextarea={
            <>
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
              {props.attachments.length > 0 ? (
                <div className="mb-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {props.attachments.map((attachment) => (
                    <AttachmentPreview key={attachment.id} attachment={attachment} onRemove={props.onRemoveAttachment} />
                  ))}
                </div>
              ) : null}
            </>
          }
          leadingActions={
            <>
              <button
                className={appShell.iconAction}
                type="button"
                title={t("composer.addSourceFiles")}
                aria-label={t("composer.addSourceFiles")}
                disabled={props.creating}
                onClick={() => importInputRef.current?.click()}
              >
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
      aria-disabled={props.disabled ? true : undefined}
      role="button"
      tabIndex={props.disabled ? -1 : 0}
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
      <span className="mr-auto grid min-w-0 flex-1 gap-1">
        <span className="truncate text-[14px] font-bold leading-none">{props.label}</span>
        <small className={cn("truncate text-[12px] font-medium", props.active ? "text-[#8B8275]" : props.disabled ? "text-[#8B8275]/72" : "text-[#8B8275]")}>{props.description}</small>
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

function formatOptionClass(active: boolean, disabled?: boolean) {
  return cn(
    "flex min-h-16 items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors",
    active && "border-[#D8CDB9]/80 bg-[#F4EFE6] text-[#2A2620] shadow-[0_12px_10px_rgba(0,0,0,0.08)]",
    disabled && "border-[#D8CDB9]/48 bg-[#E6DDCD]/42 text-[#8B8275]/80",
    !active && !disabled && "border-[#B8A07C]/42 bg-[#E6DDCD]/36 text-[#2A2620]/82 hover:border-[#5C6B50]/36 hover:bg-[#E6DDCD]/52 hover:text-[#2A2620]",
  );
}

function formatOptionIconClass(active: boolean, disabled?: boolean) {
  return cn(
    "grid size-9 shrink-0 place-items-center rounded-[14px]",
    active && "bg-[#5C6B50] text-[#F4EFE6]",
    disabled && "bg-[#D8CDB9]/58 text-[#8B8275]/72",
    !active && !disabled && "bg-[#F4EFE6]/82 text-[#5C6B50]",
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

function AttachmentPreview(props: { attachment: HomeAttachment; onRemove: (id: string) => void }) {
  return (
    <div className="group relative flex h-[72px] w-[220px] shrink-0 items-center gap-3 rounded-[16px] border border-[#B8A07C]/45 bg-[#E6DDCD]/54 p-2">
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-[#F4EFE6] text-[#5C6B50]">
        {props.attachment.previewUrl ? (
          <img className="h-full w-full object-cover" src={props.attachment.previewUrl} alt="" draggable={false} />
        ) : props.attachment.mimeType.startsWith("image/") ? (
          <FileImage size={22} />
        ) : (
          <File size={22} />
        )}
      </div>
      <div className="min-w-0 pr-7">
        <div className="truncate text-[13px] font-medium text-[#2A2620]">{props.attachment.name}</div>
        <div className="mt-1 text-[12px] font-medium text-[#8B8275]">{formatFileSize(props.attachment.size)}</div>
      </div>
      <button
        className="absolute right-2 top-2 z-10 grid size-6 place-items-center rounded-full bg-[#2A2620] text-[#F4EFE6] shadow-lg hover:text-[#E6DDCD]"
        type="button"
        aria-label={`Remove ${props.attachment.name}`}
        onClick={() => props.onRemove(props.attachment.id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
