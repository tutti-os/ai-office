import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Minus, MoreHorizontal, Plus, Rows3, SlidersHorizontal } from "lucide-react";

export type ToolbarMoreOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

export type ParagraphSpacingValue = {
  label: string;
  marginTop: string;
  marginBottom: string;
};

export function IconButton(props: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="grid size-8 place-items-center rounded-md bg-white/8 text-white/62 hover:bg-white/14 hover:text-white disabled:bg-white/5 disabled:text-white/22"
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function IconButtonLight(props: { title: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={`grid size-7 shrink-0 place-items-center rounded-md text-[#242424] transition hover:bg-black/[0.045] disabled:text-black/20 disabled:opacity-45 ${
        props.active ? "bg-black/[0.07] text-black" : ""
      }`}
      type="button"
      title={props.title}
      disabled={props.disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function ToolbarMoreMenu(props: {
  open: boolean;
  options: ToolbarMoreOption[];
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(window.innerWidth - 236, rect.right - 224)),
      top: rect.bottom + 8,
    });
  };

  useEffect(() => {
    if (!props.open) return;
    updatePosition();
    const close = () => props.onOpenChange(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [props.open, props.onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        className={`grid size-7 shrink-0 place-items-center rounded-md text-[#242424] transition hover:bg-black/[0.06] ${
          props.open ? "bg-black/[0.08] text-black shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]" : ""
        }`}
        type="button"
        title="More"
        aria-haspopup="menu"
        aria-expanded={props.open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          updatePosition();
          props.onOpenChange(!props.open);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {props.open ? (
        <div
          className="fixed z-50 max-h-[320px] w-56 overflow-y-auto rounded-xl border border-black/10 bg-white py-1.5 text-[#242424] shadow-[0_18px_42px_rgba(0,0,0,0.18)]"
          data-toolbar-skip-selection-preserve="true"
          role="menu"
          style={{ left: position.left, top: position.top }}
        >
          {props.options.map((option) => (
            <button
              className="flex h-7 w-full items-center justify-between px-2.5 text-left text-[10px] font-medium hover:bg-black/[0.05] disabled:text-black/28"
              disabled={option.disabled}
              key={option.value}
              role="menuitem"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ToolbarLineHeightMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (lineHeight: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const options = [
    { label: "Normal", value: "normal" },
    { label: "1.15", value: "1.15" },
    { label: "1.5", value: "1.5" },
    { label: "2", value: "2" },
  ];

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(window.innerWidth - 156, rect.right - 144)),
      top: rect.bottom + 8,
    });
  };

  useEffect(() => {
    if (!props.open) return;
    updatePosition();
    const close = () => props.onOpenChange(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [props.open, props.onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        className={`grid size-7 shrink-0 place-items-center rounded-md text-[#242424] transition hover:bg-black/[0.06] ${
          props.open ? "bg-black/[0.08] text-black shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]" : ""
        }`}
        type="button"
        title="Line spacing"
        aria-haspopup="menu"
        aria-expanded={props.open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          updatePosition();
          props.onOpenChange(!props.open);
        }}
      >
        <Rows3 size={16} />
      </button>
      {props.open ? (
        <div
          className="fixed z-50 w-36 overflow-hidden rounded-xl border border-black/10 bg-white py-1.5 text-[#242424] shadow-[0_18px_42px_rgba(0,0,0,0.18)]"
          data-toolbar-skip-selection-preserve="true"
          role="menu"
          style={{ left: position.left, top: position.top }}
        >
          {options.map((option) => (
            <button
              className="flex h-7 w-full items-center px-2.5 text-left text-[10px] font-medium hover:bg-black/[0.05]"
              key={option.value}
              role="menuitem"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ToolbarLetterSpacingMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (letterSpacing: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const options = [
    { label: "Normal", value: "normal" },
    { label: "Default", value: "0" },
    { label: "Loose", value: "0.04em" },
    { label: "Wide", value: "0.08em" },
  ];

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(window.innerWidth - 172, rect.right - 160)),
      top: rect.bottom + 8,
    });
  };

  useEffect(() => {
    if (!props.open) return;
    updatePosition();
    const close = () => props.onOpenChange(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [props.open, props.onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        className={`grid size-7 shrink-0 place-items-center rounded-md text-[#242424] transition hover:bg-black/[0.06] ${
          props.open ? "bg-black/[0.08] text-black shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]" : ""
        }`}
        type="button"
        title="Letter spacing"
        aria-haspopup="menu"
        aria-expanded={props.open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          updatePosition();
          props.onOpenChange(!props.open);
        }}
      >
        <SlidersHorizontal size={16} />
      </button>
      {props.open ? (
        <div
          className="fixed z-50 w-40 overflow-hidden rounded-xl border border-black/10 bg-white py-1.5 text-[#242424] shadow-[0_18px_42px_rgba(0,0,0,0.18)]"
          data-toolbar-skip-selection-preserve="true"
          role="menu"
          style={{ left: position.left, top: position.top }}
        >
          {options.map((option) => (
            <button
              className="flex h-7 w-full items-center justify-between px-2.5 text-left text-[10px] font-medium hover:bg-black/[0.05]"
              key={option.value}
              role="menuitem"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onSelect(option.value)}
            >
              <span>{option.label}</span>
              <span className="text-[9px] text-black/45">{option.value === "normal" ? "" : option.value}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ToolbarParagraphSpacingMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (spacing: ParagraphSpacingValue) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const options: ParagraphSpacingValue[] = [
    { label: "Compact", marginTop: "0", marginBottom: "4px" },
    { label: "Normal", marginTop: "0", marginBottom: "12px" },
    { label: "Relaxed", marginTop: "0", marginBottom: "18px" },
    { label: "Section", marginTop: "20px", marginBottom: "12px" },
  ];

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(window.innerWidth - 196, rect.right - 184)),
      top: rect.bottom + 8,
    });
  };

  useEffect(() => {
    if (!props.open) return;
    updatePosition();
    const close = () => props.onOpenChange(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [props.open, props.onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        className={`grid size-7 shrink-0 place-items-center rounded-md text-[#242424] transition hover:bg-black/[0.06] ${
          props.open ? "bg-black/[0.08] text-black shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]" : ""
        }`}
        type="button"
        title="Paragraph spacing"
        aria-haspopup="menu"
        aria-expanded={props.open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          updatePosition();
          props.onOpenChange(!props.open);
        }}
      >
        <Rows3 className="rotate-90" size={16} />
      </button>
      {props.open ? (
        <div
          className="fixed z-50 w-44 overflow-hidden rounded-xl border border-black/10 bg-white py-1.5 text-[#242424] shadow-[0_18px_42px_rgba(0,0,0,0.18)]"
          data-toolbar-skip-selection-preserve="true"
          role="menu"
          style={{ left: position.left, top: position.top }}
        >
          {options.map((option) => (
            <button
              className="flex h-7 w-full items-center justify-between px-2.5 text-left text-[10px] font-medium hover:bg-black/[0.05]"
              key={option.label}
              role="menuitem"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onSelect(option)}
            >
              <span>{option.label}</span>
              <span className="text-[9px] text-black/45">{option.marginTop}/{option.marginBottom}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ToolbarGroup(props: { children: ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-px">
      {props.children}
    </div>
  );
}

export function FontSizeControl(props: { value: string; onChange: (fontSize: string) => void }) {
  const [draft, setDraft] = useState(fontSizeNumber(props.value));

  useEffect(() => {
    setDraft(fontSizeNumber(props.value));
  }, [props.value]);

  const commit = (nextValue = draft) => {
    const next = clampFontSize(nextValue);
    setDraft(String(next));
    props.onChange(`${next}px`);
  };

  const step = (delta: number) => {
    const next = clampFontSize(String((Number.parseInt(draft, 10) || 14) + delta));
    props.onChange(`${next}px`);
  };

  return (
    <div className="flex h-7 shrink-0 items-center rounded-lg border border-black/[0.12] bg-white px-0.5 shadow-[0_1px_1px_rgba(0,0,0,0.02)]" title="Font size">
      <button
        className="grid size-6 place-items-center rounded-md text-[#444] hover:bg-black/[0.06]"
        type="button"
        title="Decrease font size"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => step(-1)}
      >
        <Minus size={13} />
      </button>
      <input
        aria-label="Font size"
        className="h-6 w-9 border-0 bg-transparent text-center text-[12px] font-semibold leading-none text-[#252525] outline-none"
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value.replace(/[^\d]/g, "").slice(0, 3))}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            step(1);
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            step(-1);
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
      />
      <button
        className="grid size-6 place-items-center rounded-md text-[#444] hover:bg-black/[0.06]"
        type="button"
        title="Increase font size"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => step(1)}
      >
        <Plus size={13} />
      </button>
    </div>
  );
}

function fontSizeNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  return String(Number.isFinite(parsed) ? Math.max(1, Math.min(400, parsed)) : 14);
}

function clampFontSize(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 14;
  return Math.max(1, Math.min(400, parsed));
}

export function ToolbarSelect(props: {
  title: string;
  value: string;
  compact?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      className={`relative flex h-7 shrink-0 items-center rounded-lg border border-black/[0.12] bg-white px-2.5 pr-7 shadow-[0_1px_1px_rgba(0,0,0,0.02)] ${
        props.compact ? "min-w-[78px]" : "min-w-[170px]"
      }`}
    >
      <span className="sr-only">{props.title}</span>
      <select
        className="h-6 w-full appearance-none border-0 bg-transparent text-[12px] font-medium leading-none text-[#252525] outline-none"
        value={props.value}
        title={props.title}
        onChange={(event) => {
          props.onChange(event.currentTarget.value);
        }}
      >
        {props.children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#343434]" size={13} />
    </label>
  );
}

export function ColorSwatch(props: { title: string; color: string; onClick: () => void }) {
  return (
    <button
      className="grid size-7 shrink-0 place-items-center rounded-md hover:bg-black/[0.06]"
      type="button"
      title={props.title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.onClick}
    >
      <span className="block size-3.5 rounded-full border border-black/15" style={{ backgroundColor: props.color }} />
    </button>
  );
}

export function ToolbarDivider() {
  return <span className="mx-1.5 h-6 w-px shrink-0 bg-black/[0.10]" />;
}
