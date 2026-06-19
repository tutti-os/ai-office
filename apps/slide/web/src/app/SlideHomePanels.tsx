import { ChevronLeft, ChevronRight, Clock3, Copy, Plus, X } from "lucide-react";
import type { OutputType, SlideTemplate } from "../templates";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function CategoryButton(props: { active: boolean; count: number; label: string; onClick: () => void }) {
  return (
    <button className={cn("inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 text-[12px] font-bold", props.active ? "bg-white text-black" : "bg-[#303030] text-white/72 hover:bg-[#383838]")} type="button" onClick={props.onClick}>
      <span>{humanizeCategory(props.label)}</span>
      <small className="opacity-50">{props.count}</small>
    </button>
  );
}

export function BlankTemplateCard(props: { outputType: OutputType; onCreate: () => void }) {
  return (
    <button className="mb-5 flex h-[292px] w-full min-w-0 break-inside-avoid flex-col items-center justify-center gap-2.5 rounded-lg border border-white/10 bg-[#303030] text-left text-inherit transition hover:-translate-y-0.5 hover:bg-[#373737] hover:shadow-[0_18px_46px_rgba(0,0,0,0.34)]" type="button" onClick={props.onCreate}>
      <span className="grid size-[58px] place-items-center rounded-full bg-white text-black">
        <Plus size={26} />
      </span>
      <strong className="text-[14px] font-extrabold">Blank deck</strong>
      <small className="text-white/48">Blank presentation</small>
      <em className="text-[11px] not-italic font-extrabold text-white/48">{props.outputType === "html" ? "DECK" : props.outputType.toUpperCase()}</em>
    </button>
  );
}

export function TemplateCard(props: { showCategory: boolean; template: SlideTemplate; onSelect: (template: SlideTemplate) => void }) {
  const { template } = props;
  return (
    <button
      className="mb-5 grid w-full min-w-0 break-inside-avoid grid-rows-[auto_1fr] overflow-hidden rounded-lg border-0 bg-[#303030] text-left text-inherit shadow-[0_14px_34px_rgba(0,0,0,0.24)] transition hover:-translate-y-0.5 hover:bg-[#373737] hover:shadow-[0_18px_46px_rgba(0,0,0,0.34)]"
      type="button"
      aria-label={`Create ${template.name}`}
      onClick={() => props.onSelect(template)}
    >
      <span className="block aspect-video overflow-hidden bg-white">
        {template.coverImage ? <img className="block size-full object-cover" src={template.coverImage} alt="" loading="lazy" draggable={false} /> : <span className="grid h-full place-items-center p-5 text-center text-[12px] font-extrabold text-[#222]">{template.name}</span>}
      </span>
      <span className={cn("flex min-w-0 flex-col justify-start gap-[7px] p-3", props.showCategory ? "min-h-[92px]" : "min-h-0")}>
        <strong className="line-clamp-3 overflow-hidden text-[12px] font-extrabold leading-[1.35] text-white">{template.name}</strong>
        {props.showCategory ? <span className="mt-auto inline-flex h-6 w-fit max-w-full items-center overflow-hidden truncate rounded-full border border-white/10 bg-white/[0.07] px-2.5 text-[11px] font-bold text-white/62">{humanizeCategory(template.category)}</span> : null}
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
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/62 p-[18px]" role="presentation" onMouseDown={props.onClose}>
      <section
        aria-modal="true"
        className="relative flex h-[min(900px,calc(100vh_-_24px))] w-[min(960px,calc(100vw_-_24px))] flex-col overflow-hidden rounded-[18px] bg-white text-[#202124] shadow-[0_32px_120px_rgba(0,0,0,0.42)] max-md:h-auto max-md:max-h-[calc(100vh_-_20px)] max-md:w-[calc(100vw_-_20px)]"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="absolute right-7 top-5 z-[3] grid size-9 place-items-center border-0 bg-transparent text-[#80848c] max-md:right-4 max-md:top-3" type="button" aria-label="Close template preview" onClick={props.onClose}>
          <X size={26} />
        </button>

        <div className="grid shrink-0 basis-[340px] grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] gap-7 px-[34px] pb-[18px] pt-[58px] max-md:basis-auto max-md:grid-cols-1 max-md:gap-6 max-md:px-[18px] max-md:pb-[18px] max-md:pt-[52px]">
          <div className="min-w-0">
            <div className="inline-flex h-[30px] max-w-full items-center overflow-hidden whitespace-nowrap rounded-[9px] bg-[#f2f3f5] px-3.5 text-[13px] font-black uppercase tracking-[0.08em] text-[#60636a] max-md:h-[34px]">{humanizeCategory(props.template.category)}</div>
            <h2 className="my-3 mt-[18px] max-w-full text-[30px] font-black leading-[1.16] text-[#202124] md:text-[32px]">{props.template.name}</h2>
            <div className="inline-flex h-[34px] max-w-full items-center gap-2.5 overflow-hidden rounded-[10px] bg-[#f5f5f5] px-3 text-[13px] font-bold text-[#6a6d74] max-md:h-10">
              <span className="text-[#9a9da3]">Name:</span>
              <code className="min-w-0 truncate font-mono">{props.template.slug}</code>
              <Copy size={18} />
            </div>
            <blockquote className="mt-[18px] line-clamp-2 max-w-[840px] overflow-hidden border-l-[5px] border-[#202124] pl-[18px] text-[16px] italic leading-[1.55] text-[#24262a] max-md:text-[17px]">{props.template.shortDescription || props.template.description}</blockquote>
          </div>

          <div className="relative self-center overflow-hidden rounded-[14px] border border-[#eceef1] bg-white shadow-[inset_0_0_0_1px_rgba(17,24,39,0.02)]">
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between gap-4 border-t border-[#eceef1] px-[34px] py-[18px] max-md:px-[18px]">
            <h3 className="m-0 text-[22px] font-black leading-tight text-[#202124]">All Slides</h3>
            <span className="text-[13px] font-bold text-[#80848c]">{slideCount} slides</span>
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

        <div className="absolute inset-x-0 bottom-0 flex justify-end border-t border-[#eceef1] bg-white/96 px-[34px] py-4 backdrop-blur max-md:px-[18px]">
          <button className="h-10 rounded-xl border-0 bg-[#202124] px-7 text-[15px] font-extrabold text-white disabled:cursor-default disabled:bg-[#d1d5db]" type="button" disabled={props.creating} onClick={() => props.onUseTemplate(props.template)}>
            {props.creating ? "Adding..." : "Use"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function RecentEmptyState() {
  return (
    <div className="mt-[18px] grid min-h-[220px] place-items-center gap-2 rounded-xl border border-white/8 bg-[#2b2b2b] p-7 text-center">
      <Clock3 size={22} />
      <strong className="text-[14px] font-extrabold">No history yet</strong>
      <span className="max-w-[420px] text-[13px] leading-relaxed text-white/48">Create a presentation or open a template to see it here.</span>
    </div>
  );
}

function humanizeCategory(value: string) {
  if (value === "All") return value;
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
