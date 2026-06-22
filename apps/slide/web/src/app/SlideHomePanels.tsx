import { ChevronLeft, ChevronRight, Clock3, Copy, FileCode2, FileText, History, Plus, Trash2, X } from "lucide-react";
import { appShell, categoryPillClass, historyActionsClass, historyCardClass, historyClearButtonClass, historyDeleteButtonClass, historyEmptyIconClass, historyEmptyStateClass, scrollbarClass, templateCardClass } from "@ai-app/ui/app-shell";
import type { SlideProject } from "@ai-slide/shared";
import type { OutputType, SlideTemplate } from "../templates";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function CategoryButton(props: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <button className={cn(categoryPillClass(props.active), "inline-flex items-center gap-2")} type="button" onClick={props.onClick}>
      <span>{humanizeCategory(props.label)}</span>
      <small className={props.active ? "text-[#F4EFE6]/58" : "text-[#8B8275]"}>{props.count}</small>
    </button>
  );
}

export function BlankTemplateCard(props: { outputType: OutputType; onCreate: () => void }) {
  return (
    <button className={cn("mb-5 flex h-[292px] w-full min-w-0 break-inside-avoid flex-col items-center justify-center gap-2.5 rounded-[20px] border border-[#B8A07C]/60 bg-[#F4EFE6]/70 text-left text-[#5C6B50] backdrop-blur transition hover:-translate-y-0.5 hover:border-[#5C6B50]/60", appShell.cardShadow)} type="button" onClick={props.onCreate}>
      <span className="grid size-[58px] place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
        <Plus size={26} />
      </span>
      <strong className="text-[14px] font-medium text-[#2A2620]">Blank deck</strong>
      <small className="text-[#8B8275]">Blank presentation</small>
      <em className="text-[11px] not-italic font-medium text-[#8B8275]">{props.outputType === "html" ? "DECK" : props.outputType.toUpperCase()}</em>
    </button>
  );
}

export function TemplateCard(props: { showCategory: boolean; template: SlideTemplate; onSelect: (template: SlideTemplate) => void }) {
  const { template } = props;
  return (
    <button
      className={cn("mb-5 grid w-full min-w-0 break-inside-avoid grid-rows-[auto_1fr]", templateCardClass())}
      type="button"
      aria-label={`Create ${template.name}`}
      onClick={() => props.onSelect(template)}
    >
      <span className="block aspect-video overflow-hidden bg-white">
        {template.coverImage ? <img className="block size-full object-cover" src={template.coverImage} alt="" loading="lazy" draggable={false} /> : <span className="grid h-full place-items-center p-5 text-center text-[12px] font-extrabold text-[#222]">{template.name}</span>}
      </span>
      <span className={cn("flex min-w-0 flex-col justify-start gap-[7px] p-3", props.showCategory ? "min-h-[92px]" : "min-h-0")}>
        <strong className="line-clamp-3 overflow-hidden text-[12px] font-medium leading-[1.35] text-[#2A2620]">{template.name}</strong>
        {props.showCategory ? <span className="mt-auto inline-flex h-6 w-fit max-w-full items-center overflow-hidden truncate rounded-full border border-[#B8A07C]/55 bg-[#E6DDCD]/55 px-2.5 text-[11px] font-medium text-[#8B8275]">{humanizeCategory(template.category)}</span> : null}
      </span>
    </button>
  );
}

export function TemplatePreviewModal(props: {
  creating: boolean;
  selectedIndex: number;
  template: SlideTemplate;
  onClose: () => void;
  onSelectIndex: (index: number) => void;
  onUseTemplate: (template: SlideTemplate) => void;
}) {
  const thumbnails =
    props.template.thumbnailImages.length > 0
      ? props.template.thumbnailImages
      : props.template.previewImages.length > 0
        ? props.template.previewImages
        : [props.template.coverImage].filter(Boolean);
  const previews = props.template.previewImages.length > 0 ? props.template.previewImages : thumbnails;
  const selectedIndex = Math.min(Math.max(props.selectedIndex, 0), Math.max(thumbnails.length - 1, 0));
  const selectedImage = previews[selectedIndex] ?? thumbnails[selectedIndex] ?? props.template.coverImage;
  const slideCount = Math.max(thumbnails.length, previews.length, props.template.slideCount);

  const move = (offset: -1 | 1) => {
    if (thumbnails.length === 0) return;
    props.onSelectIndex((selectedIndex + offset + thumbnails.length) % thumbnails.length);
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#2A2620]/62 p-[18px]" role="presentation" onMouseDown={props.onClose}>
      <section
        aria-modal="true"
        className={cn("relative flex h-[min(900px,calc(100vh_-_24px))] w-[min(960px,calc(100vw_-_24px))] flex-col overflow-hidden rounded-[20px] bg-[#F4EFE6] text-[#2A2620] max-md:h-auto max-md:max-h-[calc(100vh_-_20px)] max-md:w-[calc(100vw_-_20px)]", appShell.cardShadow)}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="absolute right-7 top-5 z-[3] grid size-9 place-items-center rounded-full border border-[#B8A07C]/45 bg-[#F4EFE6]/70 text-[#8B8275] hover:text-[#5C6B50] max-md:right-4 max-md:top-3" type="button" aria-label="Close template preview" onClick={props.onClose}>
          <X size={26} />
        </button>

        <div className="grid shrink-0 basis-[340px] grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-7 px-[34px] pb-[18px] pt-[58px] max-md:basis-auto max-md:grid-cols-1 max-md:gap-6 max-md:px-[18px] max-md:pb-[18px] max-md:pt-[52px]">
          <div className="min-w-0">
            <div className="inline-flex h-[30px] max-w-full items-center overflow-hidden whitespace-nowrap rounded-full bg-[#5C6B50] px-3.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#F4EFE6] max-md:h-[34px]">{humanizeCategory(props.template.category)}</div>
            <h2 className="my-3 mt-[18px] max-w-full text-[30px] font-semibold leading-[1.16] text-[#2A2620] md:text-[32px]">{props.template.name}</h2>
            <div className="inline-flex h-[34px] max-w-full items-center gap-2.5 overflow-hidden rounded-full border border-[#B8A07C]/50 bg-[#E6DDCD]/55 px-3 text-[13px] font-medium text-[#2A2620]/72 max-md:h-10">
              <span className="text-[#8B8275]">Name:</span>
              <code className="min-w-0 truncate font-mono">{props.template.slug}</code>
              <Copy size={18} />
            </div>
            <blockquote className="mt-[18px] line-clamp-2 max-w-[840px] overflow-hidden border-l-[5px] border-[#5C6B50] pl-[18px] text-[16px] italic leading-[1.55] text-[#2A2620]/78 max-md:text-[17px]">{props.template.shortDescription || props.template.description}</blockquote>
          </div>

          <div className="relative self-center overflow-hidden rounded-[20px] border border-[#B8A07C]/45 bg-white shadow-[inset_0_0_0_1px_rgba(17,24,39,0.02)]">
            {selectedImage ? <img className="block aspect-video w-full object-cover" src={selectedImage} alt="" draggable={false} /> : <div className="grid aspect-video w-full place-items-center bg-[#f3f0ea] p-7 text-center text-[18px] font-extrabold text-[#202124]">{props.template.name}</div>}
            {thumbnails.length > 1 ? (
              <>
                <button className="absolute left-3 top-1/2 grid size-[46px] -translate-y-1/2 place-items-center rounded-full border border-[#202124]/8 bg-white/86 text-[#202124] shadow-[0_10px_24px_rgba(0,0,0,0.12)]" type="button" aria-label="Previous slide" onClick={() => move(-1)}>
                  <ChevronLeft size={30} />
                </button>
                <button className="absolute right-3 top-1/2 grid size-[46px] -translate-y-1/2 place-items-center rounded-full border border-[#202124]/8 bg-white/86 text-[#202124] shadow-[0_10px_24px_rgba(0,0,0,0.12)]" type="button" aria-label="Next slide" onClick={() => move(1)}>
                  <ChevronRight size={30} />
                </button>
              </>
            ) : null}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/64 px-2.5 py-1 text-[11px] font-extrabold text-white">
              {selectedIndex + 1} / {slideCount}
            </div>
          </div>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto", scrollbarClass)}>
          <div className="flex items-center justify-between gap-4 border-t border-[#B8A07C]/45 px-[34px] py-[18px] max-md:px-[18px]">
            <h3 className="m-0 text-[22px] font-semibold leading-tight text-[#2A2620]">All Slides</h3>
            <span className="text-[13px] font-medium text-[#8B8275]">{slideCount} slides</span>
          </div>

          <div className="flex flex-wrap gap-4 px-[34px] pb-24 max-md:px-[18px]">
            {thumbnails.map((image, index) => (
              <button
                key={`${image}-${index}`}
                className={cn("relative basis-[calc(33.333%_-_11px)] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white p-0 text-left shadow-[0_10px_24px_rgba(0,0,0,0.08)] max-md:basis-full", index === selectedIndex ? "border-[#202124] ring-2 ring-[#202124]/12" : "")}
                type="button"
                aria-label={`Preview slide ${index + 1}`}
                onClick={() => props.onSelectIndex(index)}
              >
                <span className="absolute left-2 top-2 z-[2] rounded-md bg-black/58 px-1.5 py-1 font-mono text-[10px] font-black text-white">{String(index + 1).padStart(2, "0")}</span>
                <img className="block aspect-video w-full object-cover" src={image} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex justify-end border-t border-[#B8A07C]/45 bg-[#F4EFE6]/96 px-[34px] py-4 backdrop-blur max-md:px-[18px]">
          <button className="h-10 rounded-full border-0 bg-[#2A2620] px-7 text-[15px] font-medium text-[#F4EFE6] disabled:cursor-default disabled:bg-[#B8A07C]/32 disabled:text-[#8B8275]" type="button" disabled={props.creating} onClick={() => props.onUseTemplate(props.template)}>
            {props.creating ? "Adding..." : "Use"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ProjectHistory(props: {
  loading: boolean;
  projects: SlideProject[];
  onClearHistory: () => void;
  onDeleteProject: (projectId: string) => void;
  onOpenProject: (project: SlideProject) => void;
}) {
  if (props.projects.length === 0) {
    return (
      <div className="mt-5">
        <HistoryPanelActions loading={props.loading} projectCount={props.projects.length} onClearHistory={props.onClearHistory} />
        <RecentEmptyState />
      </div>
    );
  }
  return (
    <div className="mt-5">
      <HistoryPanelActions loading={props.loading} projectCount={props.projects.length} onClearHistory={props.onClearHistory} />
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {props.projects.map((project) => (
          <ProjectHistoryCard key={project.id} project={project} onDelete={props.onDeleteProject} onOpen={props.onOpenProject} />
        ))}
      </div>
    </div>
  );
}

function HistoryPanelActions(props: { loading: boolean; projectCount: number; onClearHistory: () => void }) {
  return (
    <div className={historyActionsClass}>
      <button
        className={historyClearButtonClass}
        type="button"
        disabled={props.loading || props.projectCount === 0}
        onClick={props.onClearHistory}
        title="Clear history"
      >
        <Trash2 size={13} />
        Clear history
      </button>
    </div>
  );
}

function ProjectHistoryCard(props: { project: SlideProject; onDelete: (projectId: string) => void; onOpen: (project: SlideProject) => void }) {
  return (
    <div className={cn("group", historyCardClass())}>
      <button
        aria-label={`Open ${props.project.title}`}
        className="block h-full min-h-[132px] w-full rounded-[20px] p-4 text-left"
        type="button"
        onClick={() => props.onOpen(props.project)}
      >
        <div className="pr-12">
          <div className="truncate text-[13px] font-medium text-[#2A2620]">{props.project.title}</div>
          <div className="mt-1 truncate text-[11px] text-[#8B8275]">{props.project.templateName ?? "Blank deck"}</div>
        </div>
        <div className="mt-5 flex items-center gap-1.5 text-[11px] text-[#8B8275]">
          <Clock3 size={12} />
          {formatProjectDate(props.project.updatedAt)}
        </div>
      </button>
      <div className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
        {props.project.templateId ? <FileCode2 size={15} /> : <FileText size={15} />}
      </div>
      <button
        aria-label={`Delete ${props.project.title}`}
        className={historyDeleteButtonClass}
        type="button"
        title="Delete project"
        onClick={() => props.onDelete(props.project.id)}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function RecentEmptyState() {
  return (
    <div className={cn("mt-3", historyEmptyStateClass)}>
      <div className={historyEmptyIconClass}><History size={17} /></div>
      <strong className="text-[14px] font-medium text-[#2A2620]">No history yet</strong>
      <span className="max-w-[420px] text-[13px] leading-relaxed text-[#8B8275]">Create a presentation or open a template to see it here.</span>
    </div>
  );
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

function humanizeCategory(value: string) {
  if (value === "All") return value;
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
