import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Download } from "lucide-react";

export type ArtifactEditorKind = "html" | "markdown" | "docx" | "deck" | "pptx";

export const artifactEditorGridClass =
  "grid h-screen min-h-0 grid-cols-[400px_minmax(0,1fr)] overflow-hidden bg-[#1f1f1f] font-sans text-white";

export function ArtifactEditorFrame(props: {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cx(artifactEditorGridClass, props.className)}>
      {props.sidebar}
      <section className={cx("grid min-h-0 min-w-0 overflow-hidden", props.contentClassName)}>{props.children}</section>
    </section>
  );
}

export type ArtifactSaveState = "saved" | "saving" | "error" | "loading";

export type ArtifactExportItem = {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
};

export function ArtifactWorkspaceHeader(props: {
  title: string;
  saveState: ArtifactSaveState;
  exportItems: ArtifactExportItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/8 px-5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 truncate text-[13px] font-semibold text-white">{props.title}</div>
        <SaveStateBadge state={props.saveState} />
      </div>
      <div ref={rootRef} className="relative shrink-0">
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/8 px-3 text-[12px] font-semibold text-white/72 hover:bg-white/14 hover:text-white"
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <Download size={14} />
          Export
          <ChevronDown size={13} />
        </button>
        {open ? (
          <div
            className="absolute right-0 top-[calc(100%_+_6px)] z-30 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#2b2b2b] py-1.5 shadow-[0_18px_46px_rgba(0,0,0,0.35)]"
            role="menu"
          >
            {props.exportItems.map((item) => (
              <button
                className="block h-8 w-full border-0 bg-transparent px-3 text-left text-[12px] font-semibold text-white/68 hover:bg-white/8 hover:text-white disabled:cursor-default disabled:text-white/24"
                disabled={item.disabled}
                key={item.label}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

function SaveStateBadge(props: { state: ArtifactSaveState }) {
  const tone =
    props.state === "error"
      ? "bg-[#ff6b57] shadow-[0_0_0_3px_rgba(255,107,87,0.12)]"
      : props.state === "saved"
        ? "bg-[#37d67a] shadow-[0_0_0_3px_rgba(55,214,122,0.12)]"
        : "bg-[#f5c542] shadow-[0_0_0_3px_rgba(245,197,66,0.14)]";
  const label =
    props.state === "error" ? "Save error" : props.state === "saved" ? "Saved" : props.state === "loading" ? "Loading" : "Saving";
  return (
    <span className="relative top-px inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-white/42" title={label}>
      <span className={`size-1.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
