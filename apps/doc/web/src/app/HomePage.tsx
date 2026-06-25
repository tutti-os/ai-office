import { useEffect, useMemo, useRef, useState } from "react";
import { FileCode2, FileText, Hash, History, Plus, Upload } from "lucide-react";
import { parseDocxDocumentManifest, type DocumentProject, type DocumentType, type LocalAgentProviderStatus, type OfficeCliStatus, type RuntimeProfile } from "@ai-doc/shared";
import {
  allTemplatesLabel,
  type TuttiTemplate,
} from "../templates/tuttiTemplates";
import {
  ArtifactHistoryPanel,
  homeContentClass,
  HomeCategoryPill,
  homeHeroSectionClass,
  HomePageShell,
  HomePanelToggle,
  homeTitleClass,
  HomeTopAction,
  homeWorkSectionClass,
} from "@ai-app/ui/app-shell";
import { HomeComposer } from "./HomeComposer";
import { artifactHistoryCopy } from "../i18n/copy";
import { useI18n } from "../i18n";
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
  onDeleteHistoryProject: (projectId: string) => void;
  onOpenHistoryProject: (project: DocumentProject) => void;
  onImportFile: (file: File) => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: DocumentType) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRuntimeProfileChange: (profileId: string) => void;
  onSelectTemplate: (template: TuttiTemplate) => void;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const { t } = useI18n();

  return (
    <HomePageShell>
      <input
        ref={importInputRef}
        className="hidden"
        type="file"
        accept=".html,.htm,.md,.markdown,.docx,text/html,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onImportFile(file);
        }}
      />
      <HomeTopAction
        disabled={props.loading}
        icon={<Upload size={14} />}
        title={t("home.importTitle")}
        onClick={() => importInputRef.current?.click()}
      >
        {t("home.import")}
      </HomeTopAction>

      <div className={homeContentClass}>
        <section className={homeHeroSectionClass}>
          <h1 className={homeTitleClass}>{t("home.heading")}</h1>

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

        <section className={homeWorkSectionClass}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <HomePanelToggle active={props.activePanel === "templates"} icon={<FileText size={15} />} label={t("home.templates")} onClick={() => props.onActivePanelChange("templates")} />
                  <HomePanelToggle active={props.activePanel === "history"} icon={<History size={15} />} label={t("home.history")} onClick={() => props.onActivePanelChange("history")} />
                </div>
                <div className="text-[12px] font-medium text-[#8B8275]">
                  {props.activePanel === "templates"
                    ? props.selectedCategory === allTemplatesLabel
                      ? t("home.templateCount", { count: props.templateCounts[allTemplatesLabel] ?? 0 })
                      : t("home.templateCount", { count: props.templateCounts[props.selectedCategory] ?? 0 })
                    : t("home.projectCount", { count: props.historyProjects.length })}
                </div>
              </div>
            </div>
            {props.activePanel === "templates" ? (
              <div className="flex min-w-0 gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {props.categories.map((item) => {
                  const active = item === props.selectedCategory;
                  const count = props.templateCounts[item] ?? 0;
                  return (
                    <HomeCategoryPill
                      key={item}
                      active={active}
                      count={count}
                      label={item === allTemplatesLabel ? t("home.allTemplates") : item}
                      onClick={() => props.onCategoryChange(item)}
                    />
                  );
                })}
              </div>
            ) : null}
          </div>

          {props.activePanel === "templates" ? (
            <TemplateMasonry
              showBlank={props.selectedCategory === allTemplatesLabel}
              templates={props.templates}
              onCreateBlank={props.onCreateBlank}
              onSelectTemplate={props.onSelectTemplate}
            />
          ) : (
            <ProjectHistory
              loading={props.loading}
              projects={props.historyProjects}
              onClearHistory={props.onClearHistory}
              onDeleteProject={props.onDeleteHistoryProject}
              onOpenProject={props.onOpenHistoryProject}
            />
          )}
        </section>
      </div>
    </HomePageShell>
  );
}

type MasonryItem =
  | { kind: "blank" }
  | { kind: "template"; template: TuttiTemplate };

const templateMasonryGapPx = 20;
const templateMasonryMinColumnWidthPx = 190;
const templateMasonryMaxColumns = 5;

function TemplateMasonry(props: {
  showBlank: boolean;
  templates: TuttiTemplate[];
  onCreateBlank: () => void;
  onSelectTemplate: (template: TuttiTemplate) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const items = useMemo<MasonryItem[]>(
    () => [
      ...(props.showBlank ? [{ kind: "blank" } as const] : []),
      ...props.templates.map((template) => ({ kind: "template" as const, template })),
    ],
    [props.showBlank, props.templates],
  );
  const measuredWidth = containerWidth || 1180;
  const columnCount = Math.max(
    1,
    Math.min(
      templateMasonryMaxColumns,
      items.length || 1,
      Math.floor((measuredWidth + templateMasonryGapPx) / (templateMasonryMinColumnWidthPx + templateMasonryGapPx)) || 1,
    ),
  );
  const columnWidth = (measuredWidth - templateMasonryGapPx * (columnCount - 1)) / columnCount;
  const columns = useMemo(
    () => distributeMasonryItems(items, columnCount, columnWidth),
    [columnCount, columnWidth, items],
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? 0;
      setContainerWidth((current) => Math.abs(current - nextWidth) > 1 ? nextWidth : current);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className="mt-4 flex items-start gap-5">
      {columns.map((column, index) => (
        <div key={index} className="flex min-w-0 flex-1 flex-col gap-7">
          {column.map((item) => item.kind === "blank"
            ? <BlankTemplateCard key="blank" onCreate={props.onCreateBlank} />
            : <TemplateCard key={item.template.id} template={item.template} onSelect={props.onSelectTemplate} />,
          )}
        </div>
      ))}
    </div>
  );
}

function distributeMasonryItems(items: MasonryItem[], columnCount: number, columnWidth: number) {
  const columns: MasonryItem[][] = Array.from({ length: columnCount }, () => []);
  const heights = Array.from({ length: columnCount }, () => 0);
  for (const item of items) {
    const columnIndex = shortestColumnIndex(heights);
    columns[columnIndex]!.push(item);
    heights[columnIndex] += estimatedTemplateCardHeight(item, columnWidth) + 28;
  }
  return columns;
}

function shortestColumnIndex(heights: number[]) {
  return heights.reduce((bestIndex, height, index) => height < heights[bestIndex]! ? index : bestIndex, 0);
}

function estimatedTemplateCardHeight(item: MasonryItem, columnWidth: number) {
  if (item.kind === "blank") return columnWidth / 0.72 + 36;
  const width = item.template.screenshot_width;
  const height = item.template.screenshot_height;
  const aspectRatio = width && height ? width / height : 0.72;
  return columnWidth / aspectRatio + 42;
}

function BlankTemplateCard(props: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <div className="group w-full min-w-0">
      <button
        className="flex aspect-[0.72] w-full min-h-[212px] flex-col items-center justify-center rounded-[20px] border border-[#B8A07C]/60 bg-[#F4EFE6]/70 text-[#5C6B50] shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[#5C6B50]/60"
        type="button"
        aria-label={t("home.blankDocAria")}
        onClick={props.onCreate}
      >
        <Plus className="mb-4 opacity-60" size={26} />
      </button>
      <div className="mt-2 truncate px-1 text-[12px] font-medium text-[#2A2620]">{t("home.blankDoc")}</div>
    </div>
  );
}

function ProjectHistory(props: {
  loading: boolean;
  projects: DocumentProject[];
  onClearHistory: () => void;
  onDeleteProject: (projectId: string) => void;
  onOpenProject: (project: DocumentProject) => void;
}) {
  const { t } = useI18n();
  return (
    <ArtifactHistoryPanel
      copy={artifactHistoryCopy(t)}
      emptyDescription={t("history.emptyDescription")}
      emptyIcon={<History size={17} />}
      emptyTitle={t("history.noHistory")}
      getId={(project) => project.id}
      getPreview={(project) => projectPreview(project, t)}
      getSubtitle={(project) => projectTypeLabel(project.type, t)}
      getTitle={(project) => project.title}
      getUpdatedAt={(project) => project.updatedAt}
      icon={(project) => <ProjectTypeIcon type={project.type} />}
      loading={props.loading}
      projects={props.projects}
      onClearHistory={props.onClearHistory}
      onDeleteProject={props.onDeleteProject}
      onOpenProject={props.onOpenProject}
    />
  );
}

function ProjectTypeIcon(props: { type: DocumentProject["type"] }) {
  if (props.type === "markdown") return <Hash size={15} />;
  if (props.type === "docx") return <FileText size={15} />;
  return <FileCode2 size={15} />;
}

function projectTypeLabel(type: DocumentProject["type"], t: ReturnType<typeof useI18n>["t"]) {
  if (type === "markdown") return t("history.typeMarkdown");
  if (type === "docx") return t("history.typeDocx");
  return t("history.typeHtml");
}

function TemplateCard(props: { template: TuttiTemplate; onSelect: (template: TuttiTemplate) => void }) {
  const { t } = useI18n();
  const aspectRatio =
    props.template.screenshot_width && props.template.screenshot_height
      ? `${props.template.screenshot_width} / ${props.template.screenshot_height}`
      : "0.72";
  return (
    <div className="group w-full min-w-0">
      <button
        className="relative w-full overflow-hidden rounded-[20px] bg-[#F4EFE6] text-left text-[#2A2620] shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)] ring-1 ring-[#B8A07C]/45 transition hover:-translate-y-0.5 hover:shadow-[0_12px_10px_rgba(0,0,0,0.08)]"
        type="button"
        aria-label={t("home.createTemplateAria", { title: props.template.name })}
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
          <div className="grid h-full place-items-center bg-[#F4EFE6] px-4 text-center text-[12px] font-medium text-[#8B8275]">
            {props.template.name}
          </div>
        )}
      </button>
      <div className="mt-2 min-w-0 px-1">
        <div className="truncate text-[12px] font-medium text-[#2A2620]">{props.template.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-[#8B8275]">{props.template.classification}</div>
      </div>
    </div>
  );
}

function projectPreview(project: DocumentProject, t: ReturnType<typeof useI18n>["t"]) {
  if (project.type === "docx") {
    const manifest = parseDocxDocumentManifest(project.content);
    if (!manifest.sha256) return t("history.docxEmptyPreview");
    return t("history.docxPreview", {
      fileName: manifest.fileName,
      size: formatFileSize(manifest.sizeBytes),
    });
  }
  const text = project.content
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`>\-[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || t("history.emptyPreview");
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
