import { useRef, useState } from "react";
import { SquareDashed } from "lucide-react";

import type { ToolbarLayoutValue } from "./index.js";
import {
  ToolbarFloatingMenu,
  clampNumber,
  cssNumber,
  cx,
  formatSliderNumber,
  toolbarIconButton,
  toolbarTip,
  toolbarTooltip,
  useDismissableFloatingLayer,
} from "./menuPrimitives.js";

export function ToolbarLayoutMenu(props: {
  disabled?: boolean;
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
        disabled={props.disabled}
        type="button"
        title="Layout"
        aria-haspopup="menu"
        aria-expanded={props.open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (props.disabled) return;
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
