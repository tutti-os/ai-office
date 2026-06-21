import { Clock3, FileText, History, Plus, Sparkles, Trash2 } from "lucide-react";
import type { DocumentProject, DocumentType, LocalAgentProviderStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import {
  allTemplatesLabel,
  type TuttiTemplate,
} from "../templates/tuttiTemplates";
import { HomeComposer } from "./HomeComposer";
import type { HomeAttachment } from "./useHomeAttachments";

export function HomePage(props: {
  activePanel: "templates" | "history";
  attachments: HomeAttachment[];
  categories: string[];
  historyProjects: DocumentProject[];
  localAgentProviders: LocalAgentProviderStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  outputType: DocumentType;
  selectedCategory: string;
  selectedRuntimeProfileId: string;
  runtimeProfiles: RuntimeProfile[];
  templateCounts: Record<string, number>;
  templates: TuttiTemplate[];
  error: string;
  loading: boolean;
  prompt: string;
  onActivePanelChange: (panel: "templates" | "history") => void;
  onAddFiles: (files: File[]) => void;
  onCategoryChange: (category: string) => void;
  onClearHistory: () => void;
  onCreateBlank: () => void;
  onCreateFromPrompt: () => void;
  onOpenHistoryProject: (project: DocumentProject) => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: DocumentType) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRuntimeProfileChange: (profileId: string) => void;
  onSelectTemplate: (template: TuttiTemplate) => void;
}) {
  return (
    <div className="relative h-full overflow-auto">
      <button
        className="absolute right-7 top-7 z-20 flex h-8 items-center gap-2 rounded-full border border-[#5b332f] bg-[#3a241f] px-3 text-[12px] font-semibold text-[#ffad9f] hover:bg-[#452822] disabled:opacity-50"
        type="button"
        disabled={props.loading}
        onClick={props.onClearHistory}
        title="Clear history data"
      >
        <Trash2 size={14} />
        Debug clear history
      </button>

      <div className="mx-auto flex w-full max-w-[1180px] flex-col px-7 pb-12 pt-14">
        <section className="mx-auto flex w-full max-w-[820px] flex-col items-center">
          <div className="mb-5 grid size-10 place-items-center rounded-full bg-white text-black">
            <Sparkles size={18} />
          </div>
          <h1 className="text-center text-[36px] font-bold leading-tight text-white">
            Ready to create any doc?
          </h1>

          <HomeComposer
            attachments={props.attachments}
            error={props.error}
            loading={props.loading}
            localAgentProviders={props.localAgentProviders}
            officeCliInstalling={props.officeCliInstalling}
            officeCliStatus={props.officeCliStatus}
            outputType={props.outputType}
            prompt={props.prompt}
            runtimeProfiles={props.runtimeProfiles}
            selectedRuntimeProfileId={props.selectedRuntimeProfileId}
            onAddFiles={props.onAddFiles}
            onCreateFromPrompt={props.onCreateFromPrompt}
            onInstallOfficeCli={props.onInstallOfficeCli}
            onOutputTypeChange={props.onOutputTypeChange}
            onPromptChange={props.onPromptChange}
            onRemoveAttachment={props.onRemoveAttachment}
            onRuntimeProfileChange={props.onRuntimeProfileChange}
          />
        </section>

        <section className="mt-9">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <HomePanelButton active={props.activePanel === "templates"} label="Templates" onClick={() => props.onActivePanelChange("templates")} />
                  <HomePanelButton active={props.activePanel === "history"} label="History" onClick={() => props.onActivePanelChange("history")} />
                </div>
                <div className="text-[12px] text-white/44">
                  {props.activePanel === "templates"
                    ? props.selectedCategory === allTemplatesLabel
                      ? `${props.templateCounts[allTemplatesLabel] ?? 0} templates`
                      : `${props.templateCounts[props.selectedCategory] ?? 0} templates`
                    : `${props.historyProjects.length} projects`}
                </div>
              </div>
            </div>
            {props.activePanel === "templates" ? (
              <div className="flex min-w-0 gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {props.categories.map((item) => {
                  const active = item === props.selectedCategory;
                  const count = props.templateCounts[item] ?? 0;
                  return (
                    <button
                      key={item}
                      className={`h-8 shrink-0 rounded-full px-4 text-[12px] font-semibold ${
                        active ? "bg-white text-black" : "bg-[#303030] text-white/78 hover:bg-[#383838]"
                      }`}
                      type="button"
                      onClick={() => props.onCategoryChange(item)}
                    >
                      {item}
                      <span className={active ? "ml-2 text-black/46" : "ml-2 text-white/36"}>{count}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          {props.activePanel === "templates" ? (
            <div className="mt-5 columns-2 gap-5 sm:columns-3 lg:columns-5">
              {props.selectedCategory === allTemplatesLabel ? (
                <div className="mb-7 inline-block w-full min-w-0 break-inside-avoid">
                  <button
                    className="group flex aspect-[0.72] w-full min-h-[212px] flex-col items-center justify-center rounded-lg border border-white/10 bg-[#303030] text-white/42 shadow-[0_14px_34px_rgba(0,0,0,0.24)] transition hover:bg-[#373737]"
                    type="button"
                    onClick={props.onCreateBlank}
                  >
                    <Plus className="mb-4 opacity-60" size={26} />
                  </button>
                  <div className="mt-2 truncate px-1 text-[12px] font-semibold text-white/72">Blank doc</div>
                </div>
              ) : null}
              {props.templates.map((template) => (
                <TemplateCard key={template.id} template={template} onSelect={props.onSelectTemplate} />
              ))}
            </div>
          ) : (
            <ProjectHistory projects={props.historyProjects} onOpenProject={props.onOpenHistoryProject} />
          )}
        </section>
      </div>
    </div>
  );
}

function HomePanelButton(props: { active: boolean; label: "Templates" | "History"; onClick: () => void }) {
  const Icon = props.label === "Templates" ? FileText : History;
  return (
    <button
      className={`flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold ${
        props.active ? "bg-white text-black" : "bg-[#303030] text-white/72 hover:bg-[#383838]"
      }`}
      type="button"
      onClick={props.onClick}
    >
      <Icon size={15} />
      {props.label}
    </button>
  );
}

function ProjectHistory(props: { projects: DocumentProject[]; onOpenProject: (project: DocumentProject) => void }) {
  if (props.projects.length === 0) {
    return (
      <div className="mt-5 grid min-h-[220px] place-items-center rounded-xl border border-white/8 bg-[#2b2b2b] px-6 text-center">
        <div>
          <div className="mx-auto mb-3 grid size-9 place-items-center rounded-full bg-white/8 text-white/58">
            <History size={17} />
          </div>
          <div className="text-[13px] font-semibold text-white/72">No history yet</div>
          <div className="mt-1 text-[12px] text-white/42">Create a doc or open a template to see it here.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
      {props.projects.map((project) => (
        <ProjectHistoryCard key={project.id} project={project} onOpen={props.onOpenProject} />
      ))}
    </div>
  );
}

function ProjectHistoryCard(props: { project: DocumentProject; onOpen: (project: DocumentProject) => void }) {
  return (
    <button
      aria-label={`Open ${props.project.title}`}
      className="min-h-[132px] rounded-lg border border-white/8 bg-[#303030] p-4 text-left shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 hover:bg-[#373737]"
      type="button"
      onClick={() => props.onOpen(props.project)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white">{props.project.title}</div>
          <div className="mt-1 truncate text-[11px] text-white/38">{props.project.templateName ?? "Blank doc"}</div>
        </div>
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white/8 text-white/62">
          <FileText size={15} />
        </div>
      </div>
      <p className="mt-4 line-clamp-2 text-[12px] leading-5 text-white/48">{projectPreview(props.project.content)}</p>
      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-white/34">
        <Clock3 size={12} />
        {formatProjectDate(props.project.updatedAt)}
      </div>
    </button>
  );
}

function TemplateCard(props: { template: TuttiTemplate; onSelect: (template: TuttiTemplate) => void }) {
  const aspectRatio =
    props.template.screenshot_width && props.template.screenshot_height
      ? `${props.template.screenshot_width} / ${props.template.screenshot_height}`
      : "0.72";
  return (
    <div className="group mb-7 inline-block w-full min-w-0 break-inside-avoid">
      <button
        className="relative w-full overflow-hidden rounded-lg bg-white text-left text-[#1f2933] shadow-[0_14px_36px_rgba(0,0,0,0.38)] ring-1 ring-white/8 transition hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(0,0,0,0.48)]"
        type="button"
        aria-label={`Create ${props.template.name}`}
        onClick={() => props.onSelect(props.template)}
        style={{ aspectRatio, minHeight: 212 }}
      >
        {props.template.screenshot_cdn_url ? (
          <img
            className="h-full w-full object-cover object-top"
            src={props.template.screenshot_cdn_url}
            alt=""
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="grid h-full place-items-center bg-[#f3f0ea] px-4 text-center text-[12px] font-semibold text-black/44">
            {props.template.name}
          </div>
        )}
      </button>
      <div className="mt-2 min-w-0 px-1">
        <div className="truncate text-[12px] font-semibold text-white/78">{props.template.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/38">{props.template.classification}</div>
      </div>
    </div>
  );
}

function projectPreview(html: string) {
  const text = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || "Empty doc";
}

function formatProjectDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
