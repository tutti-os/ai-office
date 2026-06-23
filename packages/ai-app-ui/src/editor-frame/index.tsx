import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronDown, Download, X } from "lucide-react";

export type ArtifactEditorKind = "html" | "markdown" | "docx" | "deck" | "pptx" | "xlsx";

export const artifactEditorGridClass =
  "grid h-dvh min-h-0 grid-cols-[400px_minmax(0,1fr)] overflow-hidden bg-[#1f1f1f] font-sans text-white";

export function ArtifactEditorFrame(props: {
  sidebar: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cx(artifactEditorGridClass, props.className)}>
      {props.sidebar}
      <section className={cx("grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden", props.contentClassName)}>
        {props.children}
      </section>
    </section>
  );
}

export function ArtifactAgentProcessingOverlay(props: {
  active: boolean;
  className?: string;
}) {
  if (!props.active) return null;
  return (
    <div className={cx("pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-[inherit]", props.className)} aria-hidden="true">
      <style>
        {`
          @keyframes ai-artifact-agent-sweep {
            0% { transform: translateX(-130%) skewX(-14deg); opacity: 0; }
            18% { opacity: 0.72; }
            56% { opacity: 0.58; }
            100% { transform: translateX(330%) skewX(-14deg); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .ai-artifact-agent-sweep { animation-duration: 4.8s !important; }
          }
        `}
      </style>
      <div className="absolute inset-0 bg-white/[0.025]" />
      <div
        className="ai-artifact-agent-sweep absolute -inset-y-16 left-0 w-1/3 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.05)_18%,rgba(255,255,255,0.34)_48%,rgba(147,197,253,0.20)_58%,transparent_100%)] blur-[0.5px]"
        style={{ animation: "ai-artifact-agent-sweep 2.35s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}
      />
    </div>
  );
}

export function ArtifactExportToast(props: {
  message: string;
  onClose: () => void;
  onOpenLocation: () => void;
}) {
  if (!props.message) return null;
  return (
    <div className="absolute left-1/2 top-3 z-[100] w-[640px] max-w-[calc(100%-32px)] -translate-x-1/2 rounded-[16px] border border-[#B8A07C]/55 bg-[#F4EFE6] px-4 py-2.5 text-[#2A2620] shadow-[0_18px_46px_rgba(0,0,0,0.16)]">
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="min-w-0 flex-1 truncate text-left text-[13px] font-bold text-[#2A2620] hover:text-[#5C6B50]"
          type="button"
          title={props.message}
          onClick={props.onOpenLocation}
        >
          {props.message}
        </button>
        <button
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] text-[#8B8275] hover:bg-[#E6DDCD]/55 hover:text-[#5C6B50]"
          type="button"
          aria-label="Dismiss export notice"
          title="Dismiss"
          onClick={props.onClose}
        >
          <X size={16} />
        </button>
      </div>
    </div>
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
  agentWorking?: boolean;
  stats?: string[];
  exportItems: ArtifactExportItem[];
  onBackHome?: () => void;
  tone?: "dark" | "lumen";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lumen = props.tone === "lumen";

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
    <header className={cx("flex h-12 shrink-0 items-center justify-between gap-4 border-b px-5", lumen ? "border-[#B8A07C]/45 bg-[#E6DDCD] text-[#2A2620]" : "border-white/8")}>
      <div className="flex min-w-0 items-center gap-2">
        {props.onBackHome ? (
          <button
            className={cx(
              "grid size-8 shrink-0 place-items-center rounded-[10px] border transition",
              lumen
                ? "border-[#B8A07C]/55 bg-[#F4EFE6]/70 text-[#2A2620]/72 hover:border-[#5C6B50]/50 hover:text-[#5C6B50]"
                : "border-white/10 bg-white/8 text-white/72 hover:bg-white/14 hover:text-white",
            )}
            type="button"
            aria-label="Back to home"
            title="Back to home"
            onClick={props.onBackHome}
          >
            <ArrowLeft size={16} />
          </button>
        ) : null}
        <div className={cx("min-w-0 truncate text-[13px] font-semibold", lumen ? "text-[#2A2620]" : "text-white")}>{props.title}</div>
        <SaveStateBadge agentWorking={props.agentWorking} state={props.saveState} tone={props.tone} />
        {props.stats?.length ? (
          <div className={cx("hidden min-w-0 items-center gap-1.5 text-[11px] font-semibold md:flex", lumen ? "text-[#8B8275]" : "text-white/32")}>
            {props.stats.map((stat, index) => (
              <span className="shrink-0" key={stat}>
                {index > 0 ? <span className={cx("mr-1.5", lumen ? "text-[#B8A07C]" : "text-white/18")}>/</span> : null}
                {stat}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div ref={rootRef} className="relative shrink-0">
        <button
          className={cx(
            "inline-flex h-8 items-center gap-2 rounded-[16px] border px-3 text-[12px] font-semibold transition",
            lumen
              ? "border-[#B8A07C]/55 bg-[#F4EFE6]/70 text-[#2A2620]/72 hover:border-[#5C6B50]/50 hover:text-[#5C6B50]"
              : "border-white/10 bg-white/8 text-white/72 hover:bg-white/14 hover:text-white",
          )}
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
            className={cx(
              "absolute right-0 top-[calc(100%_+_6px)] z-30 w-44 overflow-hidden rounded-[16px] border py-1.5 shadow-[0_18px_46px_rgba(0,0,0,0.16)]",
              lumen ? "border-[#B8A07C]/55 bg-[#F4EFE6] text-[#2A2620]" : "border-white/10 bg-[#2b2b2b]",
            )}
            role="menu"
          >
            {props.exportItems.map((item) => (
              <button
                className={cx(
                  "block h-8 w-full border-0 bg-transparent px-3 text-left text-[12px] font-semibold",
                  lumen
                    ? "text-[#2A2620]/72 hover:bg-[#E6DDCD]/55 hover:text-[#5C6B50] disabled:cursor-default disabled:text-[#8B8275]/45"
                    : "text-white/68 hover:bg-white/8 hover:text-white disabled:cursor-default disabled:text-white/24",
                )}
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

function SaveStateBadge(props: { state: ArtifactSaveState; agentWorking?: boolean; tone?: "dark" | "lumen" }) {
  const tone = props.agentWorking
    ? "animate-pulse bg-[#38a7ff] shadow-[0_0_0_3px_rgba(56,167,255,0.16)]"
    : props.state === "error"
      ? "bg-[#ff6b57] shadow-[0_0_0_3px_rgba(255,107,87,0.12)]"
      : props.state === "saved"
        ? "bg-[#37d67a] shadow-[0_0_0_3px_rgba(55,214,122,0.12)]"
        : "bg-[#f5c542] shadow-[0_0_0_3px_rgba(245,197,66,0.14)]";
  const label = props.agentWorking
    ? "Agent working"
    : props.state === "error"
      ? "Save error"
      : props.state === "saved"
        ? "Saved"
        : props.state === "loading"
          ? "Loading"
          : "Saving";
  return (
    <span className={cx("relative top-px inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold", props.tone === "lumen" ? "text-[#8B8275]" : "text-white/42")} title={label}>
      <span className={`size-1.5 rounded-full ${tone}`} />
      {label}
    </span>
  );
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
