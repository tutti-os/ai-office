import { useRef, type ChangeEvent, type ReactNode } from "react";
import { Check, ChevronDown, Download, File, FileImage, Loader2, Plus, Wand2, X } from "lucide-react";
import { AgentSelectShell, appShell, cx, formatOptionClass, formatOptionIconClass } from "../app-shell/index.js";
import { PromptComposer } from "../prompt-composer/index.js";

export type ArtifactHomeAttachment = {
  id: string;
  mimeType: string;
  name: string;
  previewUrl?: string | null;
  size: number;
};

export type ArtifactHomeAgentProfile = {
  displayName: string;
  id: string;
  kind: string;
  provider?: string;
};

export type ArtifactHomeAgentProvider = {
  authState?: string;
  available?: boolean;
  provider: string;
};

export type ArtifactHomeFormatOption<T extends string> = {
  description: string;
  disabled?: boolean;
  downloadLabel?: string;
  icon: ReactNode;
  id: T;
  installing?: boolean;
  label: string;
  showInstall?: boolean;
  statusLabel?: string;
  title?: string;
  onInstall?: () => void;
};

export function ArtifactHomeComposer<T extends string>(props: {
  addFilesLabel: string;
  agentProfiles: ArtifactHomeAgentProfile[];
  agentProviders: ArtifactHomeAgentProvider[];
  agentUnavailableLabel: string;
  acceptedFileTypes?: string;
  attachments: ArtifactHomeAttachment[];
  canSubmit: boolean;
  error?: string;
  formatOptions: ArtifactHomeFormatOption<T>[];
  loading?: boolean;
  multipleFiles?: boolean;
  placeholder: string;
  prompt: string;
  selectedAgentId: string;
  selectedFormatId: T;
  selectAgentLabel: string;
  submitLabel: string;
  onAddFiles: (files: File[]) => void;
  onFormatChange: (formatId: T) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onSelectedAgentChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length > 0) props.onAddFiles(files);
  };

  return (
    <div className={cx(appShell.promptFrame, "!mt-6")}>
      <div className={cx(appShell.promptInner, "!p-3.5")}>
        <input
          ref={importInputRef}
          className="hidden"
          type="file"
          accept={props.acceptedFileTypes}
          multiple={props.multipleFiles ?? true}
          onChange={handleFileInputChange}
        />
        <div className={cx("mb-3 grid grid-cols-1 gap-2", props.formatOptions.length >= 3 ? "sm:grid-cols-3" : "md:grid-cols-2")}>
          {props.formatOptions.map((option) => (
            <FormatOption
              active={option.id === props.selectedFormatId}
              description={option.description}
              disabled={option.disabled}
              downloadLabel={option.downloadLabel}
              icon={option.icon}
              installing={option.installing}
              key={option.id}
              label={option.label}
              showInstall={option.showInstall}
              statusLabel={option.statusLabel}
              title={option.title}
              onInstall={option.onInstall}
              onClick={() => props.onFormatChange(option.id)}
            />
          ))}
        </div>
        <PromptComposer
          canSubmit={props.canSubmit}
          className={cx(appShell.promptComposer, "!p-3")}
          footerClassName="flex-wrap gap-2.5 pt-1"
          leadingActionsClassName="mr-auto flex-1 basis-[204px] flex-wrap gap-2.5 md:flex-none md:basis-auto"
          placeholder={props.placeholder}
          textareaClassName={cx("block !h-[84px] pb-2", appShell.promptTextarea)}
          trailingActionsClassName="flex-1 md:flex-none"
          value={props.prompt}
          beforeTextarea={
            props.attachments.length > 0 ? (
              <div className="mb-4 flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {props.attachments.map((attachment) => (
                  <AttachmentPreview key={attachment.id} attachment={attachment} onRemove={props.onRemoveAttachment} />
                ))}
              </div>
            ) : null
          }
          leadingActions={
            <>
              <button
                className={appShell.iconAction}
                type="button"
                title={props.addFilesLabel}
                aria-label={props.addFilesLabel}
                disabled={props.loading}
                onClick={() => importInputRef.current?.click()}
              >
                <Plus size={20} />
              </button>
              <AgentMenu
                agentProviders={props.agentProviders}
                agentProfiles={props.agentProfiles}
                agentUnavailableLabel={props.agentUnavailableLabel}
                selectedAgentId={props.selectedAgentId}
                selectAgentLabel={props.selectAgentLabel}
                onChange={props.onSelectedAgentChange}
              />
            </>
          }
          trailingActions={
            <button
              className={cx(appShell.submitAction, "inline-flex min-w-[108px] flex-1 items-center justify-center gap-2 border-0 px-[18px] text-[13px] font-semibold md:flex-none")}
              disabled={!props.canSubmit}
              type="button"
              title={props.submitLabel}
              onClick={props.onSubmit}
            >
              {props.loading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
              <span className="truncate">{props.submitLabel}</span>
            </button>
          }
          onChange={props.onPromptChange}
          onSubmit={props.onSubmit}
        />
        {props.error ? <div className={appShell.error}>{props.error}</div> : null}
      </div>
    </div>
  );
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
  statusLabel?: string;
  title?: string;
  onClick: () => void;
  onInstall?: () => void;
}) {
  return (
    <div
      className={cx(formatOptionClass(props.active, props.disabled && !props.showInstall), "!min-h-[56px] !px-3 !py-2.5")}
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
        <span className="truncate text-[15px] font-bold leading-none">{props.label}</span>
        <small className={cx("truncate text-[13px] font-medium", props.active && !props.disabled ? "text-[#8B8275]" : "text-[#EEE8DC]/62")}>{props.description}</small>
      </span>
      {props.installing ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
          <Loader2 className="animate-spin" size={14} />
        </span>
      ) : props.showInstall ? (
        <button
          className="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-[#B8A07C]/30 bg-[#5C6B50] text-[#F4EFE6] transition-colors hover:bg-[#4C5E42] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B8A07C]/45"
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
      ) : props.active ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
          <Check size={14} />
        </span>
      ) : props.statusLabel ? (
        <span className="ml-auto shrink-0 rounded-full border border-[#B8A07C]/30 bg-[#D8CDB9]/50 px-2.5 py-1 text-[11px] font-medium text-[#8B8275]">
          {props.statusLabel}
        </span>
      ) : null}
    </div>
  );
}

function AgentMenu(props: {
  agentProfiles: ArtifactHomeAgentProfile[];
  agentProviders: ArtifactHomeAgentProvider[];
  agentUnavailableLabel: string;
  selectedAgentId: string;
  selectAgentLabel: string;
  onChange: (value: string) => void;
}) {
  const hasSelectedAgent = props.agentProfiles.some((profile) => profile.id === props.selectedAgentId);
  const placeholderValue = "__agent-placeholder";
  return (
    <AgentSelectShell>
      <select
        className="h-full w-full appearance-none rounded-full border border-[#B8A07C]/30 bg-[#F4EFE6]/70 px-4 pr-9 text-[13px] font-medium text-[#2A2620] outline-none hover:border-[#B8A07C]/30 hover:text-[#5C6B50]"
        value={hasSelectedAgent ? props.selectedAgentId : placeholderValue}
        aria-label={props.selectAgentLabel}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        <option disabled value={placeholderValue}>
          {props.selectAgentLabel}
        </option>
        {props.agentProfiles.map((profile) => {
          const status = profile.kind === "local-agent" ? props.agentProviders.find((provider) => provider.provider === profile.provider) : null;
          const available = status?.available ?? props.agentProviders.length === 0;
          return (
            <option disabled={!available} key={profile.id} value={profile.id}>
              {profile.displayName}{available ? "" : ` ${props.agentUnavailableLabel}`}
            </option>
          );
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 text-[#8B8275]" size={14} />
    </AgentSelectShell>
  );
}

function AttachmentPreview(props: { attachment: ArtifactHomeAttachment; onRemove: (id: string) => void }) {
  return (
    <div className="group relative flex w-[220px] shrink-0 items-center gap-3 rounded-[12px] border border-[#B8A07C]/30 bg-[#EEE8DC]/54 p-2">
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-[#F4EFE6] text-[#5C6B50]">
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
        <div className="mt-1 text-[13px] font-medium text-[#8B8275]">{formatFileSize(props.attachment.size)}</div>
      </div>
      <button
        className="absolute right-2 top-2 z-10 grid size-6 place-items-center rounded-full border border-[#B8A07C]/30 bg-[#F4EFE6]/70 text-[#2A2620] transition-colors hover:text-[#5C6B50]"
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
