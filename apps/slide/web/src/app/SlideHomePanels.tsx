import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileCode2, FileText, Loader2, Plus, X } from "lucide-react";
import { appShell, ArtifactHistoryPanel, HomeCategoryPill, scrollbarClass, templateCardClass } from "@ai-app/ui/app-shell";
import type { SlideArtifactType, SlideProject } from "@ai-slide/shared";
import type { OutputType, SlideTemplate } from "../templates";
import { useI18n } from "../i18n";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function CategoryButton(props: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <HomeCategoryPill active={props.active} count={props.count} label={humanizeCategory(props.label)} onClick={props.onClick} />
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
  const previewSlides = useMemo(() => {
    const imageCount = Math.max(props.template.previewImages.length, props.template.thumbnailImages.length, props.template.coverImage ? 1 : 0);
    return Array.from({ length: imageCount }, (_, index) => ({
      preview: props.template.previewImages[index] ?? props.template.thumbnailImages[index] ?? (index === 0 ? props.template.coverImage : ""),
      thumbnail: props.template.thumbnailImages[index] ?? props.template.previewImages[index] ?? (index === 0 ? props.template.coverImage : ""),
    })).filter((slide) => slide.preview || slide.thumbnail);
  }, [props.template.coverImage, props.template.previewImages, props.template.thumbnailImages]);
  const selectedIndex = Math.min(Math.max(props.selectedIndex, 0), Math.max(previewSlides.length - 1, 0));
  const selectedSlide = previewSlides[selectedIndex];
  const slideCount = Math.max(previewSlides.length, props.template.slideCount);

  const move = (offset: -1 | 1) => {
    if (previewSlides.length === 0) return;
    props.onSelectIndex((selectedIndex + offset + previewSlides.length) % previewSlides.length);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      if (props.creating) return;
      props.onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.creating, props.onClose]);

  useEffect(() => {
    if (previewSlides.length < 2) return;
    const adjacentIndexes = [
      (selectedIndex + 1) % previewSlides.length,
      (selectedIndex - 1 + previewSlides.length) % previewSlides.length,
    ];
    for (const index of adjacentIndexes) {
      const src = previewSlides[index]?.preview;
      if (!src) continue;
      const image = new Image();
      image.src = src;
    }
  }, [previewSlides, selectedIndex]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[#2A2620]/62 p-[18px]" role="presentation" onMouseDown={props.creating ? undefined : props.onClose}>
      <section
        aria-modal="true"
        className={cn("relative flex h-[min(900px,calc(100vh_-_24px))] w-[min(960px,calc(100vw_-_24px))] flex-col overflow-hidden rounded-[20px] bg-[#F4EFE6] text-[#2A2620] max-md:h-auto max-md:max-h-[calc(100vh_-_20px)] max-md:w-[calc(100vw_-_20px)]", appShell.cardShadow)}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="absolute right-7 top-5 z-[3] grid size-9 place-items-center rounded-full border border-[#B8A07C]/45 bg-[#F4EFE6]/70 text-[#8B8275] hover:text-[#5C6B50] disabled:cursor-default disabled:opacity-50 max-md:right-4 max-md:top-3" type="button" aria-label="Close template preview" disabled={props.creating} onClick={props.onClose}>
          <X size={26} />
        </button>

        <div className="grid shrink-0 basis-[340px] grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-7 px-[34px] pb-[18px] pt-[58px] max-md:basis-auto max-md:grid-cols-1 max-md:gap-6 max-md:px-[18px] max-md:pb-[18px] max-md:pt-[52px]">
          <div className="min-w-0">
            <div className="inline-flex h-[30px] max-w-full items-center overflow-hidden whitespace-nowrap rounded-full bg-[#5C6B50] px-3.5 text-[12px] font-medium uppercase tracking-[0.08em] text-[#F4EFE6] max-md:h-[34px]">{humanizeCategory(props.template.category)}</div>
            <h2 className="my-3 mt-[18px] max-w-full text-[30px] font-semibold leading-[1.16] text-[#2A2620] md:text-[32px]">{props.template.name}</h2>
            <div className="inline-flex h-[34px] max-w-full items-center gap-2.5 overflow-hidden rounded-full border border-[#B8A07C]/50 bg-[#E6DDCD]/55 px-3 text-[13px] font-medium text-[#2A2620]/72 max-md:h-10">
              <span className="text-[#8B8275]">Name:</span>
              <code className="min-w-0 truncate font-mono">{props.template.slug}</code>
            </div>
            <blockquote className="mt-[18px] line-clamp-2 max-w-[840px] overflow-hidden border-l-[5px] border-[#5C6B50] pl-[18px] text-[16px] italic leading-[1.55] text-[#2A2620]/78 max-md:text-[17px]">{props.template.shortDescription || props.template.description}</blockquote>
          </div>

          <div className="relative self-center overflow-hidden rounded-[20px] border border-[#B8A07C]/45 bg-white shadow-[inset_0_0_0_1px_rgba(17,24,39,0.02)]">
            <TemplatePreviewImage
              fallbackLabel={props.template.name}
              preview={selectedSlide?.preview ?? props.template.coverImage}
              thumbnail={selectedSlide?.thumbnail ?? selectedSlide?.preview ?? props.template.coverImage}
            />
            {previewSlides.length > 1 ? (
              <>
                <button className="absolute left-3 top-1/2 z-[2] grid size-[46px] -translate-y-1/2 place-items-center rounded-full border border-[#202124]/8 bg-white/86 text-[#202124] shadow-[0_10px_24px_rgba(0,0,0,0.12)]" type="button" aria-label="Previous slide" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => {
                  event.stopPropagation();
                  move(-1);
                }}>
                  <ChevronLeft size={30} />
                </button>
                <button className="absolute right-3 top-1/2 z-[2] grid size-[46px] -translate-y-1/2 place-items-center rounded-full border border-[#202124]/8 bg-white/86 text-[#202124] shadow-[0_10px_24px_rgba(0,0,0,0.12)]" type="button" aria-label="Next slide" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => {
                  event.stopPropagation();
                  move(1);
                }}>
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

          <div className="flex flex-wrap gap-4 px-[34px] pb-[34px] max-md:px-[18px]">
            {previewSlides.map((slide, index) => (
              <button
                key={`${slide.thumbnail || slide.preview}-${index}`}
                className={cn("relative basis-[calc(33.333%_-_11px)] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white p-0 text-left shadow-[0_10px_24px_rgba(0,0,0,0.08)] max-md:basis-full", index === selectedIndex ? "border-[#202124] ring-2 ring-[#202124]/12" : "")}
                type="button"
                aria-label={`Preview slide ${index + 1}`}
                disabled={props.creating}
                onClick={() => props.onSelectIndex(index)}
              >
                <span className="absolute left-2 top-2 z-[2] rounded-md bg-black/58 px-1.5 py-1 font-mono text-[10px] font-black text-white">{String(index + 1).padStart(2, "0")}</span>
                <img className="block aspect-video w-full object-cover" src={slide.thumbnail || slide.preview} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-[#B8A07C]/45 bg-[#F4EFE6]/96 px-[34px] py-4 backdrop-blur max-md:px-[18px]">
          <button className="inline-flex h-10 min-w-[96px] items-center justify-center gap-2 rounded-full border-0 bg-[#2A2620] px-7 text-[15px] font-medium text-[#F4EFE6] disabled:cursor-default disabled:bg-[#B8A07C]/32 disabled:text-[#8B8275]" type="button" disabled={props.creating} onClick={() => props.onUseTemplate(props.template)}>
            {props.creating ? <Loader2 className="animate-spin" size={17} /> : null}
            <span>{props.creating ? "Adding..." : "Use"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function TemplatePreviewImage(props: { fallbackLabel: string; preview?: string; thumbnail?: string }) {
  const preview = props.preview || "";
  const thumbnail = props.thumbnail || preview;
  const [loadedPreview, setLoadedPreview] = useState(preview === thumbnail ? preview : "");

  useEffect(() => {
    setLoadedPreview(preview === thumbnail ? preview : "");
  }, [preview, thumbnail]);

  if (!preview && !thumbnail) {
    return <div className="grid aspect-video w-full place-items-center bg-[#f3f0ea] p-7 text-center text-[18px] font-extrabold text-[#202124]">{props.fallbackLabel}</div>;
  }

  if (!preview || preview === thumbnail) {
    return <img className="block aspect-video w-full object-cover" src={thumbnail} alt="" draggable={false} />;
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[#f3f0ea]">
      <img className="absolute inset-0 block size-full object-cover" src={thumbnail} alt="" draggable={false} />
      <img
        key={preview}
        className={cn("absolute inset-0 block size-full object-cover transition-opacity duration-150", loadedPreview === preview ? "opacity-100" : "opacity-0")}
        src={preview}
        alt=""
        draggable={false}
        onLoad={() => setLoadedPreview(preview)}
      />
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
  const { t } = useI18n();
  return (
    <ArtifactHistoryPanel
      emptyDescription="Create a presentation or open a template to see it here."
      emptyIcon={<FileText size={17} />}
      emptyTitle="No history yet"
      getId={(project) => project.id}
      getSubtitle={(project) => projectTypeLabel(project.artifactType, t)}
      getTitle={(project) => project.title}
      getUpdatedAt={(project) => project.updatedAt}
      icon={(project) => <ProjectTypeIcon type={project.artifactType} />}
      loading={props.loading}
      projects={props.projects}
      onClearHistory={props.onClearHistory}
      onDeleteProject={props.onDeleteProject}
      onOpenProject={props.onOpenProject}
    />
  );
}

function ProjectTypeIcon(props: { type: SlideArtifactType }) {
  if (props.type === "pptx") return <FileText size={15} />;
  return <FileCode2 size={15} />;
}

function projectTypeLabel(type: SlideArtifactType, t: ReturnType<typeof useI18n>["t"]) {
  if (type === "pptx") return t("history.typePptx");
  return t("history.typeDeck");
}

function humanizeCategory(value: string) {
  if (value === "All") return value;
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
