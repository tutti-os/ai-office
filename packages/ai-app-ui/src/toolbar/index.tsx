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
import { ChevronDown, Minus, Plus } from "lucide-react";
import { ToolbarFloatingInteractionContext } from "./menuPrimitives.js";

export { ToolbarLayoutMenu, ToolbarLetterSpacingMenu, ToolbarLineHeightMenu, ToolbarMoreMenu, ToolbarParagraphSpacingMenu, ToolbarSpacingMenu } from "./menus.js";
export { useDismissableFloatingLayer, useToolbarFloatingMenuPosition, type ToolbarFloatingMenuAlign, type ToolbarFloatingMenuPosition } from "./menuPrimitives.js";

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
  "mx-auto mb-4 w-[min(100%,var(--ai-toolbar-max-width))] rounded-[12px] border border-[#B8A07C]/30 bg-[#F9F4EC] px-3 py-2 text-[#2A2620]  backdrop-blur";
const toolbarRow = "flex min-w-0 items-center gap-1.5";
const toolbarIconButton =
  "inline-grid size-7 shrink-0 place-items-center rounded-[8px] border-0 bg-transparent text-[#2A2620]/72 outline-none transition hover:not-disabled:bg-[#EEE8DC]/70 hover:not-disabled:text-[#5C6B50] disabled:cursor-default disabled:text-[#8B8275] disabled:opacity-45 [&_svg]:size-[18px]";
const toolbarTooltip =
  "relative before:pointer-events-none before:absolute before:left-1/2 before:top-full before:z-50 before:mt-2 before:-translate-x-1/2 before:whitespace-nowrap before:rounded-[4px] before:bg-[#2A2620] before:px-2 before:py-1 before:text-[11px] before:font-bold before:leading-none before:text-[#F4EFE6] before:opacity-0  before:transition-opacity before:duration-150 before:content-[attr(data-tip)] hover:before:opacity-100 focus-visible:before:opacity-100";
const toolbarInputShell =
  "inline-flex h-7 shrink-0 items-center rounded-[8px] border border-[#B8A07C]/30 bg-[#F9F4EC] ";
const toolbarInputText = "h-[26px] w-full appearance-none border-0 bg-transparent text-[13px] font-semibold leading-none text-[#2A2620] outline-none disabled:cursor-default disabled:text-[#8B8275] disabled:opacity-45";
const toolbarFloatingMenu =
  "fixed z-50 max-h-80 w-56 overflow-y-auto rounded-[8px] border border-[#B8A07C]/30 bg-[#F9F4EC] py-1.5 text-[#2A2620] ";
const toolbarFloatingMenuButton =
  "flex h-7 w-full items-center justify-between border-0 bg-transparent px-2.5 text-left text-[11px] font-semibold text-inherit hover:not-disabled:bg-[#EEE8DC]/55 disabled:text-[#8B8275]/50";
const ToolbarWrapContext = createContext(false);

export const editorToolbarStripClass = "sticky top-0 z-20 shrink-0 border-b border-[#B8A07C]/30 bg-[#EEE8DC]";
export const editorToolbarClass =
  "relative !m-0 !w-full !max-w-none !rounded-none !border-0 !bg-transparent !px-3 !py-2 !shadow-none overflow-visible md:!px-5";

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
  onFloatingLayerPointerDown?: () => void;
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
    <ToolbarFloatingInteractionContext.Provider value={props.onFloatingLayerPointerDown ?? null}>
      <div
        className={cx(
          toolbarBase,
          display.sticky === false ? "" : "sticky top-0 z-10",
          display.width === "content" ? "w-fit max-w-[min(100%,var(--ai-toolbar-max-width))]" : "",
          display.density === "comfortable" ? "px-3.5 py-2.5" : "",
          display.tone === "dark" ? "border-[#B8A07C]/30 bg-[#303030] text-white" : "",
          props.className,
        )}
        data-ai-toolbar-root="true"
        data-toolbar-skip-selection-preserve={props.skipSelectionPreserve ? "true" : undefined}
        onMouseDownCapture={props.onMouseDownCapture}
        onPointerDownCapture={props.onPointerDownCapture}
        style={style}
      >
        {props.children}
      </div>
    </ToolbarFloatingInteractionContext.Provider>
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
  return <span className="mx-1.5 block h-6 w-px shrink-0 bg-[#B8A07C]/45" />;
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
      className={cx(toolbarIconButton, toolbarTooltip, props.active && !props.disabled ? "!bg-[#5C6B50] !text-[#F4EFE6]" : "", props.className)}
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
    <label className={cx(toolbarInputShell, "group relative overflow-hidden", props.compact ? "w-[104px]" : "w-[116px]")}>
      <span className="sr-only">{props.title}</span>
      <select
        className={cx(toolbarInputText, "absolute inset-0 h-full min-w-0 cursor-pointer truncate px-2.5 pr-7 disabled:cursor-default")}
        disabled={props.disabled}
        value={props.value}
        title={props.title}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        {props.children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B8275] transition-colors group-has-[select:disabled]:text-[#8B8275]/45" size={13} />
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
      className={cx(toolbarInputText, "h-7 !w-10 shrink-0 rounded-[8px] border border-[#B8A07C]/30 bg-[#F9F4EC] text-center")}
      disabled={props.disabled}
      inputMode="numeric"
      title={props.title}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value.replace(/[^\d]/g, "").slice(0, 3))}
      onMouseDown={(event) => event.stopPropagation()}
    />
  );
}

export function FontSizeControl(props: { value: string; disabled?: boolean; commitOnInput?: boolean; onChange: (fontSize: string) => void }) {
  const [draft, setDraft] = useState(fontSizeNumber(props.value));
  const [editing, setEditing] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (editing) return;
    setDraft(fontSizeNumber(props.value));
  }, [editing, props.value]);

  const commit = (nextValue = draft) => {
    const next = clampFontSize(nextValue);
    setDraft(String(next));
    props.onChange(`${next}px`);
  };

  const step = (delta: number) => {
    const next = clampFontSize(String((Number.parseInt(draft, 10) || 14) + delta));
    setDraft(String(next));
    props.onChange(`${next}px`);
  };

  return (
    <div className={cx(toolbarInputShell, "w-[76px] justify-between px-0.5")} title="Font size">
      <button
        aria-label="Decrease font size"
        className={cx(toolbarTooltip, "grid size-6 place-items-center rounded-[8px] border-0 bg-transparent text-[#2A2620]/72 hover:not-disabled:bg-[#EEE8DC]/70 hover:not-disabled:text-[#5C6B50] disabled:cursor-default disabled:text-[#8B8275] disabled:opacity-45")}
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
        onInput={(event) => {
          const nextDraft = event.currentTarget.value.replace(/[^\d]/g, "").slice(0, 3);
          setDraft(nextDraft);
          if (props.commitOnInput && nextDraft) props.onChange(`${clampFontSize(nextDraft)}px`);
        }}
        onBlur={() => {
          setEditing(false);
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
        onFocus={() => setEditing(true)}
        onMouseDown={(event) => event.stopPropagation()}
      />
      <button
        aria-label="Increase font size"
        className={cx(toolbarTooltip, "grid size-6 place-items-center rounded-[8px] border-0 bg-transparent text-[#2A2620]/72 hover:not-disabled:bg-[#EEE8DC]/70 hover:not-disabled:text-[#5C6B50] disabled:cursor-default disabled:text-[#8B8275] disabled:opacity-45")}
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
  const lastCommittedRef = useRef(props.color);

  useEffect(() => {
    lastCommittedRef.current = props.color;
  }, [props.color]);

  const commit = (color: string) => {
    if (color === lastCommittedRef.current) return;
    lastCommittedRef.current = color;
    props.onChange(color);
  };

  return (
    <label
      className={cx(
        toolbarTooltip,
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-[8px] border-0 bg-transparent px-1.5 text-[#2A2620]/72 transition hover:bg-[#EEE8DC]/70 hover:text-[#5C6B50] has-[input:disabled]:cursor-default has-[input:disabled]:text-[#8B8275] has-[input:disabled]:opacity-45",
      )}
      data-tip={toolbarTip(props.title)}
      title={props.title}
    >
      {props.icon ?? <span className="grid h-[18px] w-4 place-items-center border-b-2 border-current text-[13px] font-extrabold leading-none">A</span>}
      <span className="block size-3.5 rounded-[3px] border border-[#B8A07C]/30" style={{ backgroundColor: props.color }} />
      <input
        aria-label={props.title}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        disabled={props.disabled}
        type="color"
        value={props.color}
        onInput={(event) => commit(event.currentTarget.value)}
        onChange={(event) => commit(event.currentTarget.value)}
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
          : "bg-[#F9F4EC] text-[#8B8275]";
  return <div className={cx("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold", tone)}>{props.label}</div>;
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

function cssSize(value: number | string | undefined) {
  if (typeof value === "number") return `${value}px`;
  return value ?? "1500px";
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
