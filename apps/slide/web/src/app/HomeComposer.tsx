import { Check, ChevronDown, Download, FileCode2, FileText, Loader2, Plus, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { PromptComposer } from "@ai-app/ui/prompt-composer";
import type { LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-slide/shared";
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
  const pptxAvailable = props.officeCliStatus?.available === true;
  const selectedOutputAvailable = props.outputType !== "pptx" || pptxAvailable;
  const canSubmit = props.prompt.trim().length > 0 && !props.creating && selectedOutputAvailable;

  return (
    <PromptComposer
      canSubmit={canSubmit}
      className="mt-8 w-full text-left"
      footerClassName="flex-wrap gap-2.5"
      leadingActionsClassName="mr-auto flex-1 basis-[204px] flex-wrap gap-2.5 md:flex-none md:basis-auto"
      placeholder="Ask for a pitch deck, lesson deck, board update, research talk..."
      textareaClassName="block pb-2"
      value={props.prompt}
      beforeTextarea={
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormatOption
            active={props.outputType === "html"}
            description="Editable slide runtime"
            icon={<FileCode2 size={20} />}
            label="Deck"
            onClick={() => props.onOutputTypeChange("html")}
          />
          <FormatOption
            active={props.outputType === "pptx"}
            description={formatPptxOutputDescription(props.officeCliStatus)}
            disabled={!pptxAvailable}
            icon={<FileText size={20} />}
            installing={props.officeCliInstalling || props.officeCliStatus?.installing === true}
            label="PPTX"
            showInstall={!pptxAvailable && props.officeCliStatus?.canInstall === true}
            title={!pptxAvailable ? props.officeCliStatus?.reason ?? "OfficeCLI is required for PPTX" : undefined}
            onInstall={props.onInstallOfficeCli}
            onClick={() => props.onOutputTypeChange("pptx")}
          />
        </div>
      }
      leadingActions={
        <>
          <button className="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-white text-black" type="button" title="Add source files">
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
        <button className="inline-flex h-10 min-w-[108px] flex-1 items-center justify-center gap-2 rounded-full border-0 bg-white px-[18px] text-[13px] font-extrabold text-black disabled:cursor-default disabled:bg-white/16 disabled:text-white/36 md:flex-none" disabled={!canSubmit} type="button" title="Create deck" onClick={props.onCreate}>
          {props.creating ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
          Create
        </button>
      }
      trailingActionsClassName="flex-1 md:flex-none"
      onChange={props.onPromptChange}
      onSubmit={props.onCreate}
    />
  );
}

function formatPptxOutputDescription(officeCliStatus: OfficeCliStatus | null) {
  if (!officeCliStatus) return "Checking OfficeCLI";
  if (officeCliStatus.available) return officeCliStatus.version ? `OfficeCLI ${officeCliStatus.version}` : "OfficeCLI ready";
  if (officeCliStatus.installing) return "Installing OfficeCLI";
  return "Requires OfficeCLI";
}

function FormatOption(props: {
  active: boolean;
  description: string;
  disabled?: boolean;
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
      className={cn(
        "flex min-h-16 min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition",
        props.active
          ? "border-white bg-white text-black"
          : props.disabled
            ? "border-white/8 bg-[#292929] text-white/34"
            : "border-white/10 bg-[#2f2f2f] text-white/82 hover:border-white/20 hover:bg-[#363636]",
      )}
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
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", props.active ? (props.label === "PPTX" ? "bg-[#e9f0ff] text-[#2f66d9]" : "bg-[#e9f7ef] text-[#187a44]") : props.disabled ? "bg-white/5 text-white/28" : "bg-white/8 text-white/64")}>{props.icon}</span>
      <span className="grid min-w-0 gap-1">
        <span className="truncate text-[14px] font-extrabold leading-none">{props.label}</span>
        <small className="truncate text-[12px] font-bold text-current opacity-50">{props.description}</small>
      </span>
      {props.active ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-black text-white">
          <Check size={14} />
        </span>
      ) : props.showInstall ? (
        <span
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/8 text-white/58 hover:bg-white/12 hover:text-white"
          role="button"
          tabIndex={0}
          title="Download OfficeCLI"
          aria-label="Download OfficeCLI"
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
  return (
    <label className="relative mr-auto flex h-9 w-auto flex-1 basis-[150px] items-center md:w-[168px] md:flex-none md:basis-auto">
      <select className="h-full w-full appearance-none rounded-full border border-white/10 bg-[#3b3b3b] px-4 pr-9 text-[13px] font-bold text-white outline-none" value={props.selectedAgent} aria-label="Select ACP agent" onChange={(event) => props.onChange(event.currentTarget.value)}>
        {props.runtimeProfiles.map((profile) => {
          const status = profile.kind === "local-agent" ? props.localAgentProviders.find((provider) => provider.provider === profile.provider) : null;
          const available = status?.available ?? props.localAgentProviders.length === 0;
          return (
            <option disabled={!available} key={profile.id} value={profile.id}>
              {profile.displayName}{available ? "" : " unavailable"}
            </option>
          );
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 text-white/56" size={14} />
    </label>
  );
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
