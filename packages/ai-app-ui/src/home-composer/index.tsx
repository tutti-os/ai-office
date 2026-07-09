import { useRef, type ChangeEvent, type ReactNode } from "react";
import { localAgentProviderIdsMatch, resolveAgentMenuProfiles } from "@ai-app/shared/agent-providers";
import { Check, ChevronDown, Download, File, FileImage, Loader2, Plus, Wand2, X } from "lucide-react";
import { AgentSelectShell, appShell, cx, formatOptionClass, formatOptionIconClass } from "../app-shell/index.js";
import { PromptComposer, type PromptComposerInputRenderProps } from "../prompt-composer/index.js";

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

export function CodeFilledFormatIcon(props: { size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M14 1.00098C14.4479 1.00046 14.8919 1.08734 15.3057 1.25879C15.7193 1.43022 16.0949 1.68198 16.4111 1.99902L19.9971 5.58496L20.1133 5.70605C20.3773 5.99585 20.5896 6.32951 20.7402 6.69238C20.9122 7.1067 21.0005 7.55143 21 8V20C21 20.7956 20.6837 21.5585 20.1211 22.1211C19.5585 22.6837 18.7957 23 18 23H6C5.20435 23 4.44152 22.6837 3.87891 22.1211C3.3163 21.5585 3 20.7956 3 20V4C3 3.20435 3.3163 2.44151 3.87891 1.87891C4.44152 1.3163 5.20435 1 6 1H14V1.00098ZM10.625 11.7188C10.1938 11.3741 9.56366 11.4439 9.21875 11.875L7.21875 14.375C6.92678 14.7401 6.92694 15.2598 7.21875 15.625L9.21875 18.125C9.56374 18.5561 10.1938 18.6261 10.625 18.2812C11.0562 17.9363 11.1262 17.3063 10.7812 16.875L9.28125 15L10.7812 13.125C11.1262 12.6938 11.0562 12.0638 10.625 11.7188ZM14.7812 11.875C14.4362 11.4441 13.8061 11.3739 13.375 11.7188C12.944 12.0637 12.8742 12.6938 13.2188 13.125L14.7188 15L13.2188 16.875C12.874 17.3061 12.9442 17.9362 13.375 18.2812C13.8062 18.6262 14.4362 18.5561 14.7812 18.125L16.7812 15.625C17.0733 15.2598 17.0733 14.7402 16.7812 14.375L14.7812 11.875ZM14.5 6.5C14.5 7.05222 14.9478 7.49989 15.5 7.5H19.5L14.5 2.5V6.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function MarkdownFilledFormatIcon(props: { size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M14 1.00099C14.4479 1.00048 14.8919 1.08736 15.3057 1.2588C15.7193 1.43024 16.0949 1.682 16.4111 1.99904L19.9971 5.58498L20.1133 5.70607C20.3773 5.99587 20.5896 6.32953 20.7402 6.6924C20.9122 7.10672 21.0005 7.55144 21 8.00002V20C21 20.7957 20.6837 21.5585 20.1211 22.1211C19.5585 22.6837 18.7957 23 18 23H6C5.20435 23 4.44152 22.6837 3.87891 22.1211C3.3163 21.5585 3 20.7957 3 20V4.00002C3 3.20437 3.3163 2.44153 3.87891 1.87892C4.44152 1.31631 5.20435 1.00002 6 1.00002H14V1.00099ZM10.3037 10.9258C9.90084 10.8508 9.51284 11.1167 9.4375 11.5195L9.23926 12.5772L7.53906 12.5527C7.15049 12.5472 6.81462 12.8221 6.74316 13.2041C6.65235 13.6905 7.02093 14.142 7.51562 14.1494L8.94238 14.1699L8.5127 16.4697L6.81836 16.4453C6.42607 16.4397 6.08669 16.7178 6.01465 17.1035C5.92328 17.5943 6.29572 18.0492 6.79492 18.0567L8.21289 18.0772L8.09668 18.7002C8.02142 19.1033 8.28734 19.4911 8.69043 19.5664C9.09338 19.6416 9.48119 19.3765 9.55664 18.9736L9.71973 18.0996L12.4736 18.1406L12.3271 18.9258C12.2519 19.3289 12.5178 19.7167 12.9209 19.792C13.3238 19.8672 13.7116 19.6021 13.7871 19.1992L13.9805 18.1631L15.8115 18.1904C16.2039 18.1963 16.5441 17.9189 16.6162 17.5332C16.7079 17.0423 16.3353 16.5866 15.8359 16.5791L14.2803 16.5557L14.71 14.2559L16.5479 14.2832C16.9366 14.289 17.2733 14.014 17.3447 13.6319C17.4356 13.1454 17.0661 12.6939 16.5713 12.6865L15.0068 12.6631L15.1309 12.0029C15.206 11.6 14.9401 11.212 14.5371 11.1367C14.1341 11.0616 13.7462 11.3275 13.6709 11.7305L13.5 12.6406L10.7461 12.5996L10.8975 11.792C10.9725 11.3891 10.7067 11.0011 10.3037 10.9258ZM13.2031 14.2334L12.7734 16.5332L10.0195 16.4922L10.4482 14.1924L13.2031 14.2334ZM14.5 6.50002C14.5 7.05229 14.9477 7.50001 15.5 7.50002H19.5L14.5 2.50002V6.50002Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PptFilledFormatIcon(props: { size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M14 1.00099C14.4479 1.00048 14.8919 1.08736 15.3057 1.2588C15.7193 1.43024 16.0949 1.682 16.4111 1.99904L19.9971 5.58498L20.1133 5.70607C20.3773 5.99587 20.5896 6.32953 20.7402 6.6924C20.9122 7.10672 21.0005 7.55144 21 8.00002V20C21 20.7957 20.6837 21.5585 20.1211 22.1211C19.5585 22.6837 18.7957 23 18 23H6C5.20435 23 4.44152 22.6837 3.87891 22.1211C3.3163 21.5585 3 20.7957 3 20V4.00002C3 3.20437 3.3163 2.44153 3.87891 1.87892C4.44152 1.31631 5.20435 1.00002 6 1.00002H14V1.00099ZM5.16211 13.5508C5.05171 13.5509 4.96191 13.6406 4.96191 13.751V18.7529C4.96212 18.8632 5.05184 18.9531 5.16211 18.9531H6.07422C6.18442 18.953 6.2742 18.8631 6.27441 18.7529V17.3477C6.27441 17.2374 6.36338 17.1477 6.47363 17.1475H7.29297C7.63218 17.1474 7.93312 17.0674 8.19531 16.9082C8.46268 16.7488 8.6738 16.5322 8.82812 16.2598C8.98754 15.9821 9.06729 15.668 9.06738 15.3184C9.06738 14.984 8.98753 14.6825 8.82812 14.4151C8.6738 14.1477 8.46273 13.9365 8.19531 13.7822C7.93305 13.628 7.63231 13.5508 7.29297 13.5508H5.16211ZM10.2715 13.5508C10.1613 13.5511 10.0723 13.6407 10.0723 13.751V18.7529C10.0725 18.863 10.1614 18.9528 10.2715 18.9531H11.1836C11.2939 18.9531 11.3836 18.8632 11.3838 18.7529V17.3477C11.3838 17.2373 11.4736 17.1475 11.584 17.1475H12.4023C12.7418 17.1475 13.0433 17.0676 13.3057 16.9082C13.5731 16.7488 13.7841 16.5323 13.9385 16.2598C14.0979 15.9821 14.1776 15.668 14.1777 15.3184C14.1777 14.984 14.0979 14.6825 13.9385 14.4151C13.7841 14.1476 13.5731 13.9366 13.3057 13.7822C13.0433 13.6279 12.7419 13.5508 12.4023 13.5508H10.2715ZM14.9502 13.5508C14.8398 13.5509 14.75 13.6406 14.75 13.751V14.5088C14.7504 14.6189 14.84 14.708 14.9502 14.708H16.1553C16.2656 14.7081 16.3553 14.7979 16.3555 14.9082V18.7529C16.3557 18.863 16.4446 18.9528 16.5547 18.9531H17.4668C17.5771 18.9531 17.6668 18.8632 17.667 18.7529V14.9082C17.6671 14.7979 17.7569 14.7081 17.8672 14.708H19.1113C19.2214 14.7079 19.3111 14.6188 19.3115 14.5088V13.751C19.3115 13.6406 19.2217 13.551 19.1113 13.5508H14.9502ZM7.10742 14.708C7.22048 14.708 7.32349 14.7338 7.41602 14.7852C7.5086 14.8366 7.58307 14.9094 7.63965 15.002C7.69615 15.0945 7.72461 15.2081 7.72461 15.3418C7.72448 15.4701 7.69611 15.5831 7.63965 15.6807C7.58308 15.7783 7.50851 15.8556 7.41602 15.9121C7.32347 15.9686 7.22051 15.9971 7.10742 15.9971H6.45117C6.3409 15.997 6.25119 15.9071 6.25098 15.7969V14.9082C6.25111 14.7979 6.34086 14.7081 6.45117 14.708H7.10742ZM12.2178 14.708C12.3308 14.7081 12.4338 14.7338 12.5264 14.7852C12.6189 14.8366 12.6934 14.9094 12.75 15.002C12.8064 15.0945 12.835 15.2082 12.835 15.3418C12.8348 15.47 12.8064 15.5832 12.75 15.6807C12.6935 15.7782 12.6188 15.8556 12.5264 15.9121C12.4339 15.9686 12.3308 15.997 12.2178 15.9971H11.5605C11.4504 15.9969 11.3606 15.907 11.3604 15.7969V14.9082C11.3605 14.798 11.4504 14.7082 11.5605 14.708H12.2178ZM14.5 6.50002C14.5 7.05229 14.9477 7.50001 15.5 7.50002H19.5L14.5 2.50002V6.50002Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ProductFilledFormatIcon(props: { size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
      <path
        d="M14 1.00098C14.4479 1.00046 14.8919 1.08734 15.3057 1.25879C15.7193 1.43022 16.0949 1.68198 16.4111 1.99902L19.9971 5.58496L20.1133 5.70605C20.3773 5.99585 20.5896 6.32951 20.7402 6.69238C20.9122 7.1067 21.0005 7.55143 21 8V20C21 20.7956 20.6837 21.5585 20.1211 22.1211C19.5585 22.6837 18.7957 23 18 23H6C5.20435 23 4.44152 22.6837 3.87891 22.1211C3.3163 21.5585 3 20.7956 3 20V4C3 3.20435 3.3163 2.44151 3.87891 1.87891C4.44152 1.3163 5.20435 1 6 1H14V1.00098ZM8 16C7.44772 16 7 16.4477 7 17C7 17.5523 7.44772 18 8 18H16C16.5523 18 17 17.5523 17 17C17 16.4477 16.5523 16 16 16H8ZM8 12C7.44772 12 7 12.4477 7 13C7 13.5523 7.44772 14 8 14H16C16.5523 14 17 13.5523 17 13C17 12.4477 16.5523 12 16 12H8ZM8 8C7.44772 8 7 8.44772 7 9C7 9.55228 7.44772 10 8 10H10C10.5523 10 11 9.55228 11 9C11 8.44772 10.5523 8 10 8H8ZM14.5 6.5C14.5 7.05228 14.9477 7.5 15.5 7.5H19.5L14.5 2.5V6.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

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
  renderPromptInput?: (props: PromptComposerInputRenderProps) => ReactNode;
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
        <div className={cx("mb-[-22px] grid grid-cols-1 items-end gap-1.5", props.formatOptions.length >= 3 ? "sm:grid-cols-3" : "md:grid-cols-2")}>
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
          className={cx(appShell.promptComposer, "relative z-20 !p-3")}
          footerClassName="flex-wrap gap-2.5 pt-1"
          leadingActionsClassName="mr-auto flex-1 basis-[204px] flex-wrap gap-2.5 md:flex-none md:basis-auto"
          placeholder={props.placeholder}
          renderInput={props.renderPromptInput}
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
      className={cx(
        formatOptionClass(props.active, props.disabled && !props.showInstall),
        "!min-h-[56px] !px-3 !pt-2.5",
        "!pb-8",
      )}
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
          className="ml-auto grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-white/15 bg-[#5C6B50] text-[#F4EFE6] transition-colors hover:border-white/15 hover:bg-[#4C5E42] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/30"
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
  const menuProfiles = resolveAgentMenuProfiles(props.agentProfiles, props.agentProviders);
  const hasSelectedAgent = menuProfiles.some((profile) => profile.id === props.selectedAgentId);
  const placeholderValue = "__agent-placeholder";
  return (
    <AgentSelectShell>
      <select
        className="h-full min-w-0 w-full appearance-none truncate rounded-full border border-[#B8A07C]/30 bg-[#F4EFE6]/70 px-4 pr-9 text-[13px] font-medium text-[#2A2620] outline-none hover:border-[#B8A07C]/30 hover:text-[#5C6B50]"
        value={hasSelectedAgent ? props.selectedAgentId : placeholderValue}
        aria-label={props.selectAgentLabel}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        <option disabled value={placeholderValue}>
          {props.selectAgentLabel}
        </option>
        {menuProfiles.map((profile) => {
          const status = profile.kind === "local-agent" ? props.agentProviders.find((provider) => localAgentProviderIdsMatch(provider.provider, profile.provider)) : null;
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
