import { useRef, useState, type ReactNode } from "react";
import { MoreHorizontal, Rows3, SlidersHorizontal } from "lucide-react";

import type { ParagraphSpacingValue, ToolbarMoreOption } from "./index.js";
import {
  ToolbarFloatingMenu,
  clampNumber,
  cssNumber,
  cx,
  formatSliderNumber,
  toolbarFloatingMenuButton,
  toolbarIconButton,
  toolbarTip,
  toolbarTooltip,
  useDismissableFloatingLayer,
} from "./menuPrimitives.js";

export { ToolbarLayoutMenu } from "./layoutMenu.js";

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
        className={cx(toolbarIconButton, toolbarTooltip, props.open ? "!bg-[#5C6B50] !text-[#F4EFE6]" : "")}
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
  disabled?: boolean;
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
        className={cx(toolbarIconButton, toolbarTooltip, props.open ? "!bg-[#5C6B50] !text-[#F4EFE6]" : "")}
        data-tip={toolbarTip("Spacing")}
        disabled={props.disabled}
        type="button"
        title="Spacing"
        aria-haspopup="menu"
        aria-expanded={props.open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (props.disabled) return;
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
      <span className="text-[11px] font-bold leading-4 text-[#8B8275]">{props.label}</span>
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
        className="h-7 rounded-[10px] border border-[#B8A07C]/50 bg-[#F4EFE6] px-1.5 text-center text-[12px] font-semibold text-[#2A2620] outline-none focus:border-[#5C6B50]/60"
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
        className={cx(toolbarIconButton, toolbarTooltip, props.open ? "!bg-[#5C6B50] !text-[#F4EFE6]" : "")}
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
              <span className="text-[9px] text-[#8B8275]">{props.secondary(option)}</span>
            </button>
          ))}
        </ToolbarFloatingMenu>
      ) : null}
    </>
  );
}
