import {
  createContext,
  useEffect,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import { ChevronDown, Minus, MoreHorizontal, Plus, Rows3, SlidersHorizontal, SquareDashed } from "lucide-react";

export type ToolbarDensity = "compact" | "comfortable";
export type ToolbarWidth = "content" | "full";
export type ToolbarTone = "light" | "dark";

export type ToolbarDisplayStrategy = {
  density?: ToolbarDensity;
  maxWidth?: number | string;
  sticky?: boolean;
  tone?: ToolbarTone;
  width?: ToolbarWidth;
};

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

export type ToolbarLayoutValue = {
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
};

export type ToolbarActionItem = {
  kind: "button";
  id: string;
  title: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

export type ToolbarSelectItem = {
  kind: "select";
  id: string;
  title: string;
  value: string;
  compact?: boolean;
  options: Array<{ label: string; value: string }>;
  disabled?: boolean;
  onSelect: (value: string) => void;
};

export type ToolbarStatusItem = {
  kind: "status";
  id: string;
  label: string;
  state?: "neutral" | "saving" | "error" | "success";
};

export type ToolbarCustomItem = {
  kind: "custom";
  id: string;
  render: () => ReactNode;
};

export type ToolbarItem = ToolbarActionItem | ToolbarSelectItem | ToolbarStatusItem | ToolbarCustomItem;

export type ToolbarGroupSpec = {
  id: string;
  items: ToolbarItem[];
};

const toolbarBase =
  "mx-auto mb-4 w-[min(100%,var(--ai-toolbar-max-width))] rounded-lg border border-black/[0.04] bg-white px-3 py-2 text-[#202124] shadow-[0_10px_28px_rgba(0,0,0,0.12)]";
const toolbarRow = "flex min-w-0 items-center gap-1.5";
const toolbarIconButton =
  "inline-grid size-7 shrink-0 place-items-center rounded-md border-0 bg-transparent text-[#242424] outline-none transition hover:not-disabled:bg-black/[0.07] hover:not-disabled:text-black disabled:cursor-default disabled:text-black/20 disabled:opacity-45 [&_svg]:size-[18px]";
const toolbarTooltip =
  "relative before:pointer-events-none before:absolute before:left-1/2 before:top-full before:z-50 before:mt-2 before:-translate-x-1/2 before:whitespace-nowrap before:rounded-md before:bg-[#111827] before:px-2 before:py-1 before:text-[10px] before:font-bold before:leading-none before:text-white before:opacity-0 before:shadow-[0_10px_24px_rgba(0,0,0,0.22)] before:transition-opacity before:duration-150 before:content-[attr(data-tip)] after:pointer-events-none after:absolute after:left-1/2 after:top-full after:z-50 after:mt-0.5 after:-translate-x-1/2 after:border-x-[5px] after:border-b-[5px] after:border-x-transparent after:border-b-[#111827] after:opacity-0 after:transition-opacity after:duration-150 hover:before:opacity-100 hover:after:opacity-100 focus-visible:before:opacity-100 focus-visible:after:opacity-100";
const toolbarInputShell =
  "inline-flex h-7 shrink-0 items-center rounded-lg border border-black/12 bg-white shadow-[0_1px_1px_rgba(0,0,0,0.02)]";
const toolbarInputText = "h-[26px] w-full appearance-none border-0 bg-transparent text-[12px] font-semibold leading-none text-[#252525] outline-none disabled:cursor-default disabled:text-black/20 disabled:opacity-45";
const toolbarFloatingMenu =
  "fixed z-50 max-h-80 w-56 overflow-y-auto rounded-xl border border-black/10 bg-white py-1.5 text-[#242424] shadow-[0_18px_42px_rgba(0,0,0,0.18)]";
const toolbarFloatingMenuButton =
  "flex h-7 w-full items-center justify-between border-0 bg-transparent px-2.5 text-left text-[10px] font-semibold text-inherit hover:not-disabled:bg-black/5 disabled:text-black/28";
const ToolbarWrapContext = createContext(false);

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function toolbarTip(title: string) {
  const normalized = title.trim().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    "Add column after": "Column after",
    "Add column before": "Column before",
    "Add row after": "Row after",
    "Add row before": "Row before",
    "All cell borders": "All borders",
    "Apply column width": "Column width",
    "Apply row height": "Row height",
    "Bottom cell border": "Bottom border",
    "Bulleted list": "Bullets",
    "Clear cell borders": "No borders",
    "Clear column width": "Clear width",
    "Clear formatting": "Clear",
    "Clear row height": "Clear height",
    "Collapse toolbar": "Collapse",
    "Create link": "Link",
    "Decrease font size": "Smaller",
    "Delete column": "Delete column",
    "Delete object": "Delete",
    "Delete row": "Delete row",
    "Delete table": "Delete table",
    "Distribute columns": "Distribute columns",
    "Distribute rows": "Distribute rows",
    "Duplicate object": "Duplicate",
    "Expand toolbar": "Expand",
    "Fill color": "Fill",
    "Increase font size": "Larger",
    "Inner cell borders": "Inner borders",
    "Insert table": "Table",
    "Left cell border": "Left border",
    "Layout": "Layout",
    "Merge cell down": "Merge down",
    "Merge cell right": "Merge right",
    "Move column left": "Column left",
    "Move column right": "Column right",
    "Move row down": "Row down",
    "Move row up": "Row up",
    "Numbered list": "Numbers",
    "Outer cell borders": "Outer borders",
    "Paragraph spacing": "Paragraph",
    "Remove image": "Remove image",
    "Remove link": "Unlink",
    "Right cell border": "Right border",
    "Split cell": "Split cell",
    "Text color": "Text color",
    "Top cell border": "Top border",
    "Vertical align bottom": "Align bottom",
    "Vertical align middle": "Align middle",
    "Vertical align top": "Align top",
  };
  if (aliases[normalized]) return aliases[normalized];
  const words = normalized.split(" ");
  return words.length > 2 ? words.slice(0, 2).join(" ") : normalized;
}

export function Toolbar(props: {
  children: ReactNode;
  className?: string;
  display?: ToolbarDisplayStrategy;
  onMouseDownCapture?: MouseEventHandler<HTMLDivElement>;
  onPointerDownCapture?: PointerEventHandler<HTMLDivElement>;
  skipSelectionPreserve?: boolean;
  style?: CSSProperties;
}) {
  const display = props.display ?? {};
  const style: CSSProperties = {
    ...props.style,
    "--ai-toolbar-max-width": cssSize(display.maxWidth),
  } as CSSProperties;
  return (
    <div
      className={cx(
        toolbarBase,
        display.sticky === false ? "" : "sticky top-0 z-10",
        display.width === "content" ? "w-fit max-w-[min(100%,var(--ai-toolbar-max-width))]" : "",
        display.density === "comfortable" ? "px-3.5 py-2.5" : "",
        display.tone === "dark" ? "border-white/8 bg-[#303030] text-white" : "",
        props.className,
      )}
      data-toolbar-skip-selection-preserve={props.skipSelectionPreserve ? "true" : undefined}
      onMouseDownCapture={props.onMouseDownCapture}
      onPointerDownCapture={props.onPointerDownCapture}
      style={style}
    >
      {props.children}
    </div>
  );
}

export function ToolbarRow(props: { children: ReactNode; className?: string; wrap?: boolean }) {
  const wrap = Boolean(props.wrap);
  return (
    <ToolbarWrapContext.Provider value={wrap}>
      <div
        className={cx(
          toolbarRow,
          wrap ? "flex-wrap content-start overflow-visible" : "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          props.className,
        )}
      >
        {props.children}
      </div>
    </ToolbarWrapContext.Provider>
  );
}

export function ToolbarGroup(props: { children: ReactNode; className?: string }) {
  const rowWraps = useContext(ToolbarWrapContext);
  return (
    <div className={cx(rowWraps ? "contents" : "inline-flex h-7 shrink-0 items-center gap-px", props.className)}>
      {props.children}
    </div>
  );
}

export function ToolbarDivider() {
  return <span className="mx-1.5 block h-6 w-px shrink-0 bg-black/10" />;
}

export function ToolbarSpacer() {
  return <span className="min-w-2 flex-1" />;
}

export function ToolbarIconButton(props: {
  title: string;
  tip?: string;
  active?: boolean;
  className?: string;
  dataTestId?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={props.title}
      className={cx(toolbarIconButton, toolbarTooltip, props.active ? "!bg-black/[0.07] !text-black" : "", props.className)}
      data-testid={props.dataTestId}
      data-tip={props.tip ?? toolbarTip(props.title)}
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

export function IconButton(props: { title: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      className={cx(
        toolbarTooltip,
        "inline-grid size-8 shrink-0 place-items-center rounded-md border-0 bg-white/8 text-white/62 transition hover:not-disabled:bg-white/14 hover:not-disabled:text-white disabled:cursor-default disabled:bg-white/5 disabled:text-white/22",
      )}
      aria-label={props.title}
      data-tip={toolbarTip(props.title)}
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

export function IconButtonLight(props: {
  title: string;
  active?: boolean;
  className?: string;
  dataTestId?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return <ToolbarIconButton {...props} />;
}

export function ToolbarSelect(props: {
  title: string;
  value: string;
  compact?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={cx(toolbarInputShell, "relative px-2.5 pr-7", props.compact ? "w-[104px]" : "w-[116px]")}>
      <span className="sr-only">{props.title}</span>
      <select
        className={cx(toolbarInputText, "min-w-0 truncate")}
        disabled={props.disabled}
        value={props.value}
        title={props.title}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        {props.children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#343434]" size={13} />
    </label>
  );
}

export function ToolbarNumberInput(props: {
  title: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      aria-label={props.title}
      className={cx(toolbarInputText, "h-7 !w-10 shrink-0 rounded-lg border border-black/12 bg-white text-center")}
      disabled={props.disabled}
      inputMode="numeric"
      title={props.title}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value.replace(/[^\d]/g, "").slice(0, 3))}
      onMouseDown={(event) => event.stopPropagation()}
    />
  );
}

export function FontSizeControl(props: { value: string; disabled?: boolean; onChange: (fontSize: string) => void }) {
  const [draft, setDraft] = useState(fontSizeNumber(props.value));
  const skipBlurCommitRef = useRef(false);

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
    <div className={cx(toolbarInputShell, "w-[76px] justify-between px-0.5")} title="Font size">
      <button
        aria-label="Decrease font size"
        className={cx(toolbarTooltip, "grid size-6 place-items-center rounded-md border-0 bg-transparent text-[#444] hover:not-disabled:bg-black/[0.06] disabled:cursor-default disabled:text-black/20 disabled:opacity-45")}
        data-tip={toolbarTip("Decrease font size")}
        disabled={props.disabled}
        type="button"
        title="Decrease font size"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => step(-1)}
      >
        <Minus size={13} />
      </button>
      <input
        aria-label="Font size"
        className={cx(toolbarInputText, "h-6 !w-6 text-center")}
        disabled={props.disabled}
        inputMode="numeric"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value.replace(/[^\d]/g, "").slice(0, 3))}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            skipBlurCommitRef.current = true;
            commit(event.currentTarget.value);
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
        aria-label="Increase font size"
        className={cx(toolbarTooltip, "grid size-6 place-items-center rounded-md border-0 bg-transparent text-[#444] hover:not-disabled:bg-black/[0.06] disabled:cursor-default disabled:text-black/20 disabled:opacity-45")}
        data-tip={toolbarTip("Increase font size")}
        disabled={props.disabled}
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

export function ToolbarColorInput(props: {
  title: string;
  color: string;
  disabled?: boolean;
  icon?: ReactNode;
  onChange: (color: string) => void;
}) {
  return (
    <label
      className={cx(
        toolbarTooltip,
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent px-1.5 text-[#242424] transition hover:bg-black/[0.07] has-[input:disabled]:cursor-default has-[input:disabled]:text-black/20 has-[input:disabled]:opacity-45",
      )}
      data-tip={toolbarTip(props.title)}
      title={props.title}
    >
      {props.icon ?? <span className="grid h-[18px] w-4 place-items-center border-b-2 border-current text-[13px] font-extrabold leading-none">A</span>}
      <span className="block size-3.5 rounded-[3px] border border-black/18" style={{ backgroundColor: props.color }} />
      <input
        aria-label={props.title}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        disabled={props.disabled}
        type="color"
        value={props.color}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export function ToolbarStatus(props: { label: string; state?: "neutral" | "saving" | "error" | "success" }) {
  const tone =
    props.state === "saving"
      ? "bg-amber-500/12 text-[#9a5b05]"
      : props.state === "error"
        ? "bg-red-600/10 text-[#b42318]"
        : props.state === "success"
          ? "bg-green-600/10 text-[#15803d]"
          : "bg-black/[0.04] text-black/52";
  return <div className={cx("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[10px] font-bold", tone)}>{props.label}</div>;
}

export function ToolbarMoreMenu(props: {
  open: boolean;
  options: ToolbarMoreOption[];
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(window.innerWidth - 236, rect.right - 224)),
      top: rect.bottom + 8,
    });
  };

  useDismissableFloatingLayer(props.open, props.onOpenChange, menuRef);

  return (
    <>
      <button
        ref={buttonRef}
        aria-label="More"
        className={cx(toolbarIconButton, toolbarTooltip, props.open ? "!bg-black/[0.07] !text-black" : "")}
        data-tip={toolbarTip("More")}
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
        <ToolbarFloatingMenu menuRef={menuRef} position={position}>
          {props.options.map((option) => (
            <button
              className={toolbarFloatingMenuButton}
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
        </ToolbarFloatingMenu>
      ) : null}
    </>
  );
}

export function ToolbarLineHeightMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (lineHeight: string) => void;
}) {
  const options = [
    { label: "Normal", value: "normal" },
    { label: "1.15", value: "1.15" },
    { label: "1.5", value: "1.5" },
    { label: "2", value: "2" },
  ];
  return (
    <ToolbarValueMenu
      title="Line spacing"
      icon={<Rows3 size={16} />}
      open={props.open}
      width={144}
      options={options}
      onOpenChange={props.onOpenChange}
      onSelect={props.onSelect}
    />
  );
}

export function ToolbarLetterSpacingMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (letterSpacing: string) => void;
}) {
  const options = [
    { label: "Normal", value: "normal" },
    { label: "Default", value: "0" },
    { label: "Loose", value: "0.04em" },
    { label: "Wide", value: "0.08em" },
  ];
  return (
    <ToolbarValueMenu
      title="Letter spacing"
      icon={<SlidersHorizontal size={16} />}
      open={props.open}
      width={160}
      options={options}
      onOpenChange={props.onOpenChange}
      onSelect={props.onSelect}
    />
  );
}

export function ToolbarSpacingMenu(props: {
  lineHeight: string;
  letterSpacing: string;
  open: boolean;
  onLineHeightChange: (lineHeight: string) => void;
  onLetterSpacingChange: (letterSpacing: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const width = 300;
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const lineHeightValue = cssNumber(props.lineHeight, 1.5);
  const letterSpacingValue = cssNumber(props.letterSpacing, 0);

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width)),
      top: rect.bottom + 8,
    });
  };

  useDismissableFloatingLayer(props.open, props.onOpenChange, menuRef);

  return (
    <>
      <button
        ref={buttonRef}
        aria-label="Spacing"
        className={cx(toolbarIconButton, toolbarTooltip, props.open ? "!bg-black/[0.07] !text-black" : "")}
        data-tip={toolbarTip("Spacing")}
        type="button"
        title="Spacing"
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
        <ToolbarFloatingMenu menuRef={menuRef} position={position} width={width}>
          <div className="grid gap-3 px-3 py-3" onMouseDown={(event) => event.stopPropagation()}>
            <SpacingControl
              label="Letter spacing"
              max={8}
              min={0}
              step={0.5}
              value={letterSpacingValue}
              onChange={(value) => props.onLetterSpacingChange(`${formatSliderNumber(value)}px`)}
            />
            <SpacingControl
              label="Line height"
              max={3}
              min={1}
              step={0.05}
              value={lineHeightValue}
              onChange={(value) => props.onLineHeightChange(formatSliderNumber(value))}
            />
          </div>
        </ToolbarFloatingMenu>
      ) : null}
    </>
  );
}

export function ToolbarParagraphSpacingMenu(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (spacing: ParagraphSpacingValue) => void;
}) {
  const options: ParagraphSpacingValue[] = [
    { label: "Compact", marginTop: "0", marginBottom: "4px" },
    { label: "Normal", marginTop: "0", marginBottom: "12px" },
    { label: "Relaxed", marginTop: "0", marginBottom: "18px" },
    { label: "Section", marginTop: "20px", marginBottom: "12px" },
  ];
  return (
    <ToolbarObjectMenu
      title="Paragraph spacing"
      icon={<Rows3 className="rotate-90" size={16} />}
      open={props.open}
      width={184}
      options={options}
      secondary={(option) => `${option.marginTop}/${option.marginBottom}`}
      onOpenChange={props.onOpenChange}
      onSelect={props.onSelect}
    />
  );
}

export function ToolbarLayoutMenu(props: {
  open: boolean;
  targetLabel: string;
  value: ToolbarLayoutValue;
  onChange: (value: Partial<ToolbarLayoutValue>) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const width = 440;
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width)),
      top: rect.bottom + 8,
    });
  };

  useDismissableFloatingLayer(props.open, props.onOpenChange, menuRef);

  return (
    <>
      <button
        ref={buttonRef}
        aria-label="Layout"
        className={cx(toolbarIconButton, toolbarTooltip, props.open ? "!bg-black/[0.07] !text-black" : "")}
        data-tip={toolbarTip("Layout")}
        type="button"
        title="Layout"
        aria-haspopup="menu"
        aria-expanded={props.open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          updatePosition();
          props.onOpenChange(!props.open);
        }}
      >
        <SquareDashed size={16} />
      </button>
      {props.open ? (
        <ToolbarFloatingMenu menuRef={menuRef} position={position} width={width}>
          <div className="px-3 py-3" onMouseDown={(event) => event.stopPropagation()}>
            <div className="mb-3 border-b border-black/10 pb-2 text-[11px] font-bold text-black/45">{props.targetLabel || "element"}</div>
            <LayoutBoxSection
              title="Margin"
              top={props.value.marginTop}
              right={props.value.marginRight}
              bottom={props.value.marginBottom}
              left={props.value.marginLeft}
              onChange={(value) => props.onChange({
                marginTop: value.top,
                marginRight: value.right,
                marginBottom: value.bottom,
                marginLeft: value.left,
              })}
            />
            <LayoutBoxSection
              className="mt-4"
              title="Padding"
              top={props.value.paddingTop}
              right={props.value.paddingRight}
              bottom={props.value.paddingBottom}
              left={props.value.paddingLeft}
              onChange={(value) => props.onChange({
                paddingTop: value.top,
                paddingRight: value.right,
                paddingBottom: value.bottom,
                paddingLeft: value.left,
              })}
            />
            <div className="mt-4 flex justify-center gap-2 border-t border-black/10 pt-3">
              <button
                className="h-7 rounded-md border border-black/12 bg-white px-3 text-[11px] font-bold text-black/52 hover:bg-black/[0.04] hover:text-black/70"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => props.onChange({ marginTop: "", marginRight: "", marginBottom: "", marginLeft: "" })}
              >
                Reset Margin
              </button>
              <button
                className="h-7 rounded-md border border-black/12 bg-white px-3 text-[11px] font-bold text-black/52 hover:bg-black/[0.04] hover:text-black/70"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => props.onChange({ paddingTop: "", paddingRight: "", paddingBottom: "", paddingLeft: "" })}
              >
                Reset Padding
              </button>
            </div>
          </div>
        </ToolbarFloatingMenu>
      ) : null}
    </>
  );
}

function SpacingControl(props: {
  label: string;
  max: number;
  min: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const value = clampNumber(props.value, props.min, props.max);
  const inputStep = props.step < 0.1 ? "0.05" : String(props.step);
  return (
    <label className="grid grid-cols-[88px_minmax(0,1fr)_54px] items-center gap-2">
      <span className="text-[11px] font-bold leading-4 text-black/58">{props.label}</span>
      <input
        aria-label={props.label}
        className="h-4 accent-[#3b3b3b]"
        max={props.max}
        min={props.min}
        step={props.step}
        type="range"
        value={value}
        onChange={(event) => props.onChange(Number(event.currentTarget.value))}
        onMouseDown={(event) => event.stopPropagation()}
      />
      <input
        aria-label={`${props.label} value`}
        className="h-7 rounded-md border border-black/12 bg-white px-1.5 text-center text-[12px] font-semibold text-[#242424] outline-none focus:border-black/28"
        inputMode="decimal"
        max={props.max}
        min={props.min}
        step={inputStep}
        type="number"
        value={formatSliderNumber(value)}
        onChange={(event) => props.onChange(clampNumber(Number(event.currentTarget.value) || props.min, props.min, props.max))}
        onMouseDown={(event) => event.stopPropagation()}
      />
    </label>
  );
}

function LayoutBoxSection(props: {
  title: string;
  className?: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
  onChange: (value: { top: string; right: string; bottom: string; left: string }) => void;
}) {
  const value = {
    top: props.top,
    right: props.right,
    bottom: props.bottom,
    left: props.left,
  };
  const update = (side: keyof typeof value, next: string) => props.onChange({ ...value, [side]: next });
  return (
    <section className={props.className}>
      <h3 className="mb-2 text-[12px] font-bold text-[#242424]">{props.title}</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <LayoutSideControl label="Top" value={props.top} onChange={(next) => update("top", next)} />
        <LayoutSideControl label="Right" value={props.right} onChange={(next) => update("right", next)} />
        <LayoutSideControl label="Bottom" value={props.bottom} onChange={(next) => update("bottom", next)} />
        <LayoutSideControl label="Left" value={props.left} onChange={(next) => update("left", next)} />
      </div>
    </section>
  );
}

function LayoutSideControl(props: { label: string; value: string; onChange: (value: string) => void }) {
  const value = clampNumber(cssNumber(props.value, 0), 0, 96);
  const commit = (next: number) => props.onChange(`${formatSliderNumber(clampNumber(next, 0, 96))}px`);
  return (
    <label className="grid grid-cols-[42px_minmax(0,1fr)_50px] items-center gap-2">
      <span className="text-[11px] font-semibold text-black/58">{props.label}</span>
      <input
        aria-label={props.label}
        className="h-4 accent-[#3b3b3b]"
        max={96}
        min={0}
        step={1}
        type="range"
        value={value}
        onChange={(event) => commit(Number(event.currentTarget.value))}
        onMouseDown={(event) => event.stopPropagation()}
      />
      <input
        aria-label={`${props.label} value`}
        className="h-7 rounded-md border border-black/12 bg-white px-1.5 text-center text-[12px] font-semibold text-[#242424] outline-none focus:border-black/28"
        inputMode="decimal"
        max={96}
        min={0}
        step={1}
        type="number"
        value={formatSliderNumber(value)}
        onChange={(event) => commit(Number(event.currentTarget.value) || 0)}
        onMouseDown={(event) => event.stopPropagation()}
      />
    </label>
  );
}

export function ToolbarRenderer(props: { groups: ToolbarGroupSpec[] }) {
  return (
    <>
      {props.groups.map((group, index) => (
        <FragmentWithDivider key={group.id} divider={index > 0}>
          <ToolbarGroup>
            {group.items.map((item) => {
              if (item.kind === "button") {
                return (
                  <ToolbarIconButton active={item.active} disabled={item.disabled} key={item.id} title={item.title} onClick={item.onSelect}>
                    {item.icon}
                  </ToolbarIconButton>
                );
              }
              if (item.kind === "select") {
                return (
                  <ToolbarSelect compact={item.compact} disabled={item.disabled} key={item.id} title={item.title} value={item.value} onChange={item.onSelect}>
                    {item.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </ToolbarSelect>
                );
              }
              if (item.kind === "status") {
                return <ToolbarStatus key={item.id} label={item.label} state={item.state} />;
              }
              return <span key={item.id}>{item.render()}</span>;
            })}
          </ToolbarGroup>
        </FragmentWithDivider>
      ))}
    </>
  );
}

function FragmentWithDivider(props: { children: ReactNode; divider: boolean }) {
  return (
    <>
      {props.divider ? <ToolbarDivider /> : null}
      {props.children}
    </>
  );
}

function ToolbarValueMenu(props: {
  title: string;
  icon: ReactNode;
  open: boolean;
  width: number;
  options: Array<{ label: string; value: string }>;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}) {
  return (
    <ToolbarObjectMenu
      title={props.title}
      icon={props.icon}
      open={props.open}
      width={props.width}
      options={props.options}
      secondary={(option) => (option.value === "normal" ? "" : option.value)}
      onOpenChange={props.onOpenChange}
      onSelect={(option) => props.onSelect(option.value)}
    />
  );
}

function ToolbarObjectMenu<T extends { label: string }>(props: {
  title: string;
  icon: ReactNode;
  open: boolean;
  width: number;
  options: T[];
  secondary: (option: T) => string;
  onOpenChange: (open: boolean) => void;
  onSelect: (option: T) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  const updatePosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(12, Math.min(window.innerWidth - props.width - 12, rect.right - props.width)),
      top: rect.bottom + 8,
    });
  };

  useDismissableFloatingLayer(props.open, props.onOpenChange, menuRef);

  return (
    <>
      <button
        ref={buttonRef}
        aria-label={props.title}
        className={cx(toolbarIconButton, toolbarTooltip, props.open ? "!bg-black/[0.07] !text-black" : "")}
        data-tip={toolbarTip(props.title)}
        type="button"
        title={props.title}
        aria-haspopup="menu"
        aria-expanded={props.open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          updatePosition();
          props.onOpenChange(!props.open);
        }}
      >
        {props.icon}
      </button>
      {props.open ? (
        <ToolbarFloatingMenu menuRef={menuRef} position={position} width={props.width}>
          {props.options.map((option) => (
            <button
              className={toolbarFloatingMenuButton}
              key={option.label}
              role="menuitem"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onSelect(option)}
            >
              <span>{option.label}</span>
              <span className="text-[9px] text-black/45">{props.secondary(option)}</span>
            </button>
          ))}
        </ToolbarFloatingMenu>
      ) : null}
    </>
  );
}

function ToolbarFloatingMenu(props: {
  children: ReactNode;
  menuRef: React.RefObject<HTMLDivElement | null>;
  position: { left: number; top: number };
  width?: number;
}) {
  return (
    <div
      ref={props.menuRef}
      className={toolbarFloatingMenu}
      data-toolbar-skip-selection-preserve="true"
      role="menu"
      style={{ left: props.position.left, top: props.position.top, width: props.width }}
    >
      {props.children}
    </div>
  );
}

function useDismissableFloatingLayer(open: boolean, onOpenChange: (open: boolean) => void, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChange(false);
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      close();
    };
    const closeOnOutsideScroll = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", closeOnOutsideScroll, true);
    window.addEventListener("blur", close);
    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", closeOnOutsideScroll, true);
      window.removeEventListener("blur", close);
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange, ref]);
}

function cssSize(value: number | string | undefined) {
  if (typeof value === "number") return `${value}px`;
  return value ?? "1500px";
}

function cssNumber(value: string, fallback: number) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === "normal") return fallback;
  const match = trimmed.match(/^-?\d+(\.\d+)?/);
  if (!match) return fallback;
  return Number(match[0]);
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatSliderNumber(value: number) {
  return Number(value.toFixed(2)).toString();
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
