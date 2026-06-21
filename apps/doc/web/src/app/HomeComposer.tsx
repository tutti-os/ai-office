import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { DocumentType, LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { PromptComposer } from "@ai-app/ui/prompt-composer";
import {
  Check,
  ChevronDown,
  CornerDownLeft,
  Download,
  File,
  FileCode2,
  FileImage,
  FileText,
  Hash,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useI18n } from "../i18n";
import type { HomeAttachment } from "./useHomeAttachments";

export type OutputFormatOption = {
  id: DocumentType;
  label: string;
  description: string;
};

export const outputFormatOptions: OutputFormatOption[] = [
  { id: "html", label: "HTML", description: "composer.htmlDescription" },
  { id: "markdown", label: "Markdown", description: "composer.markdownDescription" },
  { id: "docx", label: "Word", description: "composer.wordDescription" },
];

export function HomeComposer(props: {
  attachments: HomeAttachment[];
  error: string;
  loading: boolean;
  localAgentProviders: LocalAgentProviderStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  outputType: DocumentType;
  prompt: string;
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  onAddFiles: (files: File[]) => void;
  onCreateFromPrompt: () => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: DocumentType) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRuntimeProfileChange: (profileId: string) => void;
}) {
  const { t } = useI18n();
  const selectedProfile = props.runtimeProfiles.find((profile) => profile.id === props.selectedRuntimeProfileId) ?? props.runtimeProfiles[0] ?? null;
  const docxAvailable = props.officeCliStatus?.available === true;
  const selectedOutputAvailable = props.outputType !== "docx" || docxAvailable;
  const canSubmit = !props.loading && selectedOutputAvailable && (props.prompt.trim().length > 0 || props.attachments.length > 0);

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    props.onAddFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  return (
    <div className="mt-8 w-full rounded-[21px] bg-[linear-gradient(to_right_bottom,#6F7D5F,#37362F)] p-px shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)]">
      <div className="rounded-[20px] bg-[#5C6B50]/82 p-4 backdrop-blur">
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {outputFormatOptions.map((option) => {
            const disabled = option.id === "docx" && !docxAvailable;
            const active = option.id === props.outputType;
            return (
              <div
                key={option.id}
                className={`flex min-h-[64px] items-center justify-between gap-3 rounded-[16px] border px-4 py-3 text-left transition ${
                  active
                    ? "border-[#F4EFE6] bg-[#F4EFE6] text-[#2A2620] shadow-[0_12px_10px_rgba(0,0,0,0.08)]"
                    : disabled
                      ? "border-[#E6DDCD]/12 bg-[#2A2620]/10 text-[#F4EFE6]/40"
                      : "border-[#E6DDCD]/20 bg-[#F4EFE6]/10 text-[#F4EFE6]/86 hover:border-[#F4EFE6]/42 hover:bg-[#F4EFE6]/16"
                }`}
                role="button"
                tabIndex={disabled && !props.officeCliStatus?.canInstall ? -1 : 0}
                title={disabled ? props.officeCliStatus?.reason ?? t("composer.officeCliRequired") : undefined}
                onClick={() => {
                  if (!disabled) props.onOutputTypeChange(option.id);
                }}
                onKeyDown={(event) => {
                  if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  props.onOutputTypeChange(option.id);
                }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FormatIcon option={option} active={active} disabled={disabled} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold leading-none">{option.label}</div>
                    <div
                      className={
                        active
                          ? "mt-1 truncate text-[12px] font-medium text-[#8B8275]"
                          : disabled
                            ? "mt-1 truncate text-[12px] font-medium text-[#F4EFE6]/34"
                            : "mt-1 truncate text-[12px] font-medium text-[#E6DDCD]/62"
                      }
                    >
                      {formatOutputDescription(option, props.officeCliStatus, t)}
                    </div>
                  </div>
                </div>
                {active ? (
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#2A2620] text-[#F4EFE6]">
                    <Check size={15} />
                  </span>
                ) : option.id === "docx" && !docxAvailable && props.officeCliStatus?.canInstall ? (
                  <button
                    className="grid size-7 shrink-0 place-items-center rounded-[16px] border border-[#E6DDCD]/20 bg-[#F4EFE6]/12 text-[#F4EFE6]/68 hover:bg-[#F4EFE6]/18 hover:text-[#F4EFE6] disabled:cursor-wait disabled:opacity-60"
                    type="button"
                    disabled={props.officeCliInstalling || props.loading || props.officeCliStatus.installing}
                    title={t("composer.downloadOfficeCli")}
                    aria-label={t("composer.downloadOfficeCli")}
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onInstallOfficeCli();
                    }}
                  >
                    {props.officeCliInstalling || props.officeCliStatus.installing ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

      <PromptComposer
        canSubmit={canSubmit}
        placeholder={t("composer.placeholder")}
        value={props.prompt}
        className="border-[#D8CDB9]/70 bg-[#F4EFE6]/92 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
        textareaClassName="!text-[#2A2620] placeholder:!text-[#8B8275]"
        footerClassName="pt-1"
        beforeTextarea={props.attachments.length > 0 ? (
          <div className="mb-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {props.attachments.map((attachment) => (
              <AttachmentPreview key={attachment.id} attachment={attachment} onRemove={props.onRemoveAttachment} />
            ))}
          </div>
        ) : null}
        leadingActions={
          <>
            <label
              className="grid size-9 shrink-0 place-items-center rounded-full bg-[#2A2620] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)] hover:text-[#E6DDCD]"
              title={t("composer.addContext")}
              aria-label={t("composer.addContext")}
            >
              <Plus size={21} />
              <input className="sr-only" type="file" multiple onChange={handleFileInput} />
            </label>
            <AgentProfileMenu
              localAgentProviders={props.localAgentProviders}
              profiles={props.runtimeProfiles}
              selectedProfile={selectedProfile}
              onSelect={props.onRuntimeProfileChange}
            />
          </>
        }
        trailingActions={
          <button
            className="grid size-10 place-items-center rounded-full bg-[#2A2620] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)] disabled:bg-[#B8A07C]/32 disabled:text-[#8B8275]"
            type="button"
            disabled={!canSubmit}
            title={t("composer.createFromPrompt")}
            onClick={props.onCreateFromPrompt}
          >
            {props.loading ? <Loader2 className="animate-spin" size={18} /> : <CornerDownLeft size={20} />}
          </button>
        }
        onChange={props.onPromptChange}
        onSubmit={props.onCreateFromPrompt}
      />

        {props.error ? <div className="mt-4 w-full rounded-[16px] border border-[#B8A07C]/50 bg-[#F4EFE6]/80 p-3 text-[12px] leading-5 text-[#7b2e24]">{props.error}</div> : null}
      </div>
    </div>
  );
}

function AgentProfileMenu(props: {
  localAgentProviders: LocalAgentProviderStatus[];
  profiles: RuntimeProfile[];
  selectedProfile: RuntimeProfile | null;
  onSelect: (profileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = props.selectedProfile ? formatRuntimeProfileLabel(props.selectedProfile, props.localAgentProviders) : "Loading agents...";

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        className="flex h-9 w-[168px] items-center justify-between gap-3 rounded-full border border-[#B8A07C]/50 bg-[#F4EFE6]/70 px-4 text-left text-[13px] font-medium text-[#2A2620] outline-none hover:border-[#5C6B50]/50 hover:text-[#5C6B50] focus-visible:ring-2 focus-visible:ring-[#B8A07C]/50"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select ACP agent"
        disabled={props.profiles.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown className={`shrink-0 text-[#8B8275] transition ${open ? "rotate-180" : ""}`} size={14} />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full z-30 mt-2 w-[168px] overflow-hidden rounded-[16px] border border-[#B8A07C]/55 bg-[#F4EFE6] py-1.5 text-[13px] font-medium text-[#2A2620] shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)]"
          role="listbox"
        >
          {props.profiles.map((profile) => {
            const selected = profile.id === props.selectedProfile?.id;
            return (
              <button
                key={profile.id}
                className={`flex h-9 w-full items-center gap-2 px-3 text-left ${selected ? "text-[#5C6B50]" : "text-[#2A2620]/74 hover:bg-[#E6DDCD]/55 hover:text-[#5C6B50]"}`}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  props.onSelect(profile.id);
                  setOpen(false);
                }}
              >
                <span className="grid size-4 shrink-0 place-items-center">
                  {selected ? <Check size={14} /> : null}
                </span>
                <span className="min-w-0 truncate">{formatRuntimeProfileLabel(profile, props.localAgentProviders)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FormatIcon(props: { option: OutputFormatOption; active?: boolean; className?: string; small?: boolean; disabled?: boolean }) {
  const Icon = props.option.id === "markdown" ? Hash : props.option.id === "docx" ? FileText : FileCode2;
  const accent =
    props.option.id === "markdown"
      ? "bg-[#E6DDCD] text-[#5C6B50]"
      : props.option.id === "docx"
        ? "bg-[#E6DDCD] text-[#5C6B50]"
        : "bg-[#E6DDCD] text-[#5C6B50]";

  if (props.small) {
    return <Icon className={props.className ?? (props.disabled ? "text-[#F4EFE6]/32" : "text-[#F4EFE6]/72")} size={15} />;
  }

  return (
    <span className={`grid size-9 place-items-center rounded-[16px] ${props.active ? accent : props.disabled ? "bg-[#F4EFE6]/6 text-[#F4EFE6]/28" : "bg-[#F4EFE6]/12 text-[#F4EFE6]/70"}`}>
      <Icon size={20} />
    </span>
  );
}

function formatOutputDescription(option: OutputFormatOption, officeCliStatus: OfficeCliStatus | null, t: ReturnType<typeof useI18n>["t"]) {
  if (option.id !== "docx") return t(option.description as Parameters<typeof t>[0]);
  if (!officeCliStatus) return t("composer.checkingOfficeCli");
  if (officeCliStatus.installing) return t("composer.installingOfficeCli");
  if (!officeCliStatus.available && officeCliStatus.reason) return officeCliStatus.reason;
  return t(option.description as Parameters<typeof t>[0]);
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

function formatRuntimeProfileLabel(profile: RuntimeProfile, providers: LocalAgentProviderStatus[]) {
  if (profile.kind !== "local-agent") return profile.displayName;
  const provider = providers.find((item) => item.provider === profile.provider);
  if (!provider || provider.available) return profile.displayName;
  return `${profile.displayName} (${provider.authState})`;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
