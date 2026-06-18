import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { DocumentType, LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
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
import type { HomeAttachment } from "./useHomeAttachments";

export type OutputFormatOption = {
  id: DocumentType;
  label: string;
  description: string;
};

export const outputFormatOptions: OutputFormatOption[] = [
  { id: "html", label: "HTML", description: "Rich doc runtime" },
  { id: "docx", label: "Word", description: "Export as .docx" },
  { id: "markdown", label: "Markdown", description: "Plain text with syntax" },
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
  const selectedProfile = props.runtimeProfiles.find((profile) => profile.id === props.selectedRuntimeProfileId) ?? props.runtimeProfiles[0] ?? null;
  const docxAvailable = props.officeCliStatus?.available === true;
  const selectedOutputAvailable = props.outputType !== "docx" || docxAvailable;
  const canSubmit = !props.loading && selectedOutputAvailable && (props.prompt.trim().length > 0 || props.attachments.length > 0);

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    props.onAddFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handlePromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (canSubmit) props.onCreateFromPrompt();
  };

  return (
    <div className="mt-8 w-full">
      <div className="mb-4 grid grid-cols-3 gap-3">
        {outputFormatOptions.map((option) => {
          const disabled = option.id === "docx" && !docxAvailable;
          const active = option.id === props.outputType;
          return (
            <div
              key={option.id}
              className={`flex min-h-[64px] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                active
                  ? "border-white bg-white text-black"
                  : disabled
                    ? "border-white/8 bg-[#292929] text-white/34"
                    : "border-white/10 bg-[#2f2f2f] text-white/82 hover:border-white/20 hover:bg-[#363636]"
              }`}
              role="button"
              tabIndex={disabled && !props.officeCliStatus?.canInstall ? -1 : 0}
              title={disabled ? props.officeCliStatus?.reason ?? "OfficeCLI is required for Word documents" : undefined}
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
                        ? "mt-1 truncate text-[12px] font-semibold text-black/48"
                        : disabled
                          ? "mt-1 truncate text-[12px] font-semibold text-white/30"
                          : "mt-1 truncate text-[12px] font-semibold text-white/42"
                    }
                  >
                    {formatOutputDescription(option, props.officeCliStatus)}
                  </div>
                </div>
              </div>
              {active ? (
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-black text-white">
                  <Check size={15} />
                </span>
              ) : option.id === "docx" && !docxAvailable && props.officeCliStatus?.canInstall ? (
                <button
                  className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/8 text-white/58 hover:bg-white/12 hover:text-white disabled:cursor-wait disabled:opacity-60"
                  type="button"
                  disabled={props.officeCliInstalling || props.loading || props.officeCliStatus.installing}
                  title="Download OfficeCLI"
                  aria-label="Download OfficeCLI"
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

      <div className="rounded-[20px] border border-white/10 bg-[#303030] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.42)]">
        {props.attachments.length > 0 ? (
          <div className="mb-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {props.attachments.map((attachment) => (
              <AttachmentPreview key={attachment.id} attachment={attachment} onRemove={props.onRemoveAttachment} />
            ))}
          </div>
        ) : null}

        <textarea
          className="h-[108px] w-full resize-none border-0 bg-transparent px-1 text-[15px] leading-6 text-white outline-none placeholder:text-white/42"
          value={props.prompt}
          onChange={(event) => props.onPromptChange(event.target.value)}
          onKeyDown={handlePromptKeyDown}
          placeholder="Ask anything, create anything..."
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <label className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white text-black hover:bg-white/90" title="Add files">
              <Plus size={21} />
              <input className="sr-only" type="file" multiple onChange={handleFileInput} />
            </label>
            <AgentProfileMenu
              localAgentProviders={props.localAgentProviders}
              profiles={props.runtimeProfiles}
              selectedProfile={selectedProfile}
              onSelect={props.onRuntimeProfileChange}
            />
          </div>

          <div className="flex shrink-0 items-center">
            <button
              className="grid size-10 place-items-center rounded-full bg-white text-black disabled:bg-white/16 disabled:text-white/36"
              type="button"
              disabled={!canSubmit}
              title="Create from prompt"
              onClick={props.onCreateFromPrompt}
            >
              {props.loading ? <Loader2 className="animate-spin" size={18} /> : <CornerDownLeft size={20} />}
            </button>
          </div>
        </div>
      </div>

      {props.error ? <div className="mt-4 w-full rounded-xl bg-[#3a241f] p-3 text-[12px] leading-5 text-[#ffad9f]">{props.error}</div> : null}
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
        className="flex h-9 w-[168px] items-center justify-between gap-3 rounded-full border border-white/10 bg-[#3b3b3b] px-4 text-left text-[13px] font-semibold text-white outline-none hover:bg-[#424242] focus-visible:ring-2 focus-visible:ring-white/28"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select ACP agent"
        disabled={props.profiles.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown className={`shrink-0 text-white/56 transition ${open ? "rotate-180" : ""}`} size={14} />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-full z-30 mt-2 w-[168px] overflow-hidden rounded-xl border border-white/10 bg-[#2f2f2f] py-1.5 text-[13px] font-semibold text-white shadow-[0_18px_44px_rgba(0,0,0,0.46)]"
          role="listbox"
        >
          {props.profiles.map((profile) => {
            const selected = profile.id === props.selectedProfile?.id;
            return (
              <button
                key={profile.id}
                className={`flex h-9 w-full items-center gap-2 px-3 text-left ${selected ? "text-white" : "text-white/74 hover:bg-white/8 hover:text-white"}`}
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
      ? "bg-[#eee6ff] text-[#6d42ff]"
      : props.option.id === "docx"
        ? "bg-[#e9f0ff] text-[#2f66d9]"
        : "bg-[#e9f7ef] text-[#187a44]";

  if (props.small) {
    return <Icon className={props.className ?? (props.disabled ? "text-white/32" : "text-white/72")} size={15} />;
  }

  return (
    <span className={`grid size-9 place-items-center rounded-xl ${props.active ? accent : props.disabled ? "bg-white/5 text-white/28" : "bg-white/8 text-white/64"}`}>
      <Icon size={20} />
    </span>
  );
}

function formatOutputDescription(option: OutputFormatOption, officeCliStatus: OfficeCliStatus | null) {
  if (option.id !== "docx") return option.description;
  if (!officeCliStatus) return "Checking OfficeCLI";
  if (officeCliStatus.available) return officeCliStatus.version ? `OfficeCLI ${officeCliStatus.version}` : "OfficeCLI ready";
  if (officeCliStatus.installing) return "Installing OfficeCLI";
  return "Requires OfficeCLI";
}

function AttachmentPreview(props: { attachment: HomeAttachment; onRemove: (id: string) => void }) {
  return (
    <div className="group relative flex h-[72px] w-[220px] shrink-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-2">
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/8 text-white/64">
        {props.attachment.previewUrl ? (
          <img className="h-full w-full object-cover" src={props.attachment.previewUrl} alt="" draggable={false} />
        ) : props.attachment.mimeType.startsWith("image/") ? (
          <FileImage size={22} />
        ) : (
          <File size={22} />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-white">{props.attachment.name}</div>
        <div className="mt-1 text-[12px] font-semibold text-white/42">{formatFileSize(props.attachment.size)}</div>
      </div>
      <button
        className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-black text-white shadow-lg ring-1 ring-white/10 hover:bg-[#181818]"
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
