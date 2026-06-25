import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Copy,
  Lock,
  Move,
  RotateCw,
  Trash2,
  Unlock,
} from "lucide-react";
import { useToolbarFloatingMenuPosition, type ToolbarFloatingMenuPosition } from "@ai-app/ui/toolbar";
import type { DeckObjectAlignment, DeckObjectGeometry, DeckObjectGeometryPatch, DeckResizeHandle, DeckSnapGuide } from "./deckInteractionLayer";

type DeckInteractionSelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
};

type DeckInteractionActiveObject = {
  movable: boolean;
};

type DeckInteractionLayerProps = {
  activeObject: DeckInteractionActiveObject | null;
  activeGeometry: DeckObjectGeometry | null;
  selectionBox: DeckInteractionSelectionBox | null;
  snapGuides: DeckSnapGuide[];
  scale: number;
  readOnly: boolean;
  onAlignObject: (alignment: DeckObjectAlignment) => void;
  onBeginDragObject: (event: PointerEvent<HTMLElement>) => void;
  onBeginRotateObject: (event: PointerEvent<HTMLButtonElement>) => void;
  onBeginResizeObject: (handle: DeckResizeHandle, event: PointerEvent<HTMLButtonElement>) => void;
  onDeleteObject: () => void;
  onDuplicateObject: () => void;
  onDoubleClickSelection: (event: MouseEvent<HTMLElement>) => void;
  onUpdateObjectGeometry: (patch: DeckObjectGeometryPatch) => void;
};

const resizeHandles: DeckResizeHandle[] = ["top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];

const resizeHandlePosition: Record<DeckResizeHandle, string> = {
  "top-left": "-left-1 -top-1 cursor-nwse-resize",
  top: "-top-1 left-1/2 -translate-x-1/2 cursor-ns-resize",
  "top-right": "-right-1 -top-1 cursor-nesw-resize",
  right: "-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize",
  "bottom-right": "-bottom-1 -right-1 cursor-nwse-resize",
  bottom: "-bottom-1 left-1/2 -translate-x-1/2 cursor-ns-resize",
  "bottom-left": "-bottom-1 -left-1 cursor-nesw-resize",
  left: "-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize",
};
const objectToolbarTooltip =
  "relative before:pointer-events-none before:absolute before:left-1/2 before:top-full before:z-50 before:mt-2 before:-translate-x-1/2 before:whitespace-nowrap before:rounded-md before:bg-[#111827] before:px-2 before:py-1 before:text-[10px] before:font-bold before:leading-none before:text-white before:opacity-0 before:shadow-[0_10px_24px_rgba(0,0,0,0.22)] before:transition-opacity before:duration-150 before:content-[attr(data-tip)] after:pointer-events-none after:absolute after:left-1/2 after:top-full after:z-50 after:mt-0.5 after:-translate-x-1/2 after:border-x-[5px] after:border-b-[5px] after:border-x-transparent after:border-b-[#111827] after:opacity-0 after:transition-opacity after:duration-150 hover:before:opacity-100 hover:after:opacity-100 focus-visible:before:opacity-100 focus-visible:after:opacity-100";

type GeometryNumberKey = "left" | "top" | "width" | "height";
const geometryPanelWidth = 300;

const alignmentActions: Array<{ value: DeckObjectAlignment; label: string; icon: ReactNode }> = [
  { value: "left", label: "Align left", icon: <AlignStartVertical size={14} /> },
  { value: "center", label: "Align center", icon: <AlignCenterVertical size={14} /> },
  { value: "right", label: "Align right", icon: <AlignEndVertical size={14} /> },
  { value: "top", label: "Align top", icon: <AlignStartHorizontal size={14} /> },
  { value: "middle", label: "Align middle", icon: <AlignCenterHorizontal size={14} /> },
  { value: "bottom", label: "Align bottom", icon: <AlignEndHorizontal size={14} /> },
];

export function DeckInteractionLayer(props: DeckInteractionLayerProps) {
  const [geometryPanelOpen, setGeometryPanelOpen] = useState(false);
  const [proportionLocked, setProportionLocked] = useState(false);
  const objectToolbarRef = useRef<HTMLDivElement | null>(null);
  const geometryPanelRef = useRef<HTMLDivElement | null>(null);
  const geometryPanelPosition = useToolbarFloatingMenuPosition(geometryPanelOpen, objectToolbarRef, geometryPanelRef, {
    align: "center",
    width: geometryPanelWidth,
  });
  const aspectRatio = useMemo(() => {
    if (!props.activeGeometry?.height) return 1;
    return props.activeGeometry.width / props.activeGeometry.height;
  }, [props.activeGeometry?.height, props.activeGeometry?.width]);

  useEffect(() => {
    if (!props.selectionBox || props.readOnly) setGeometryPanelOpen(false);
  }, [props.readOnly, props.selectionBox]);

  useEffect(() => {
    if (!geometryPanelOpen) return undefined;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (objectToolbarRef.current?.contains(target) || geometryPanelRef.current?.contains(target)) return;
      setGeometryPanelOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [geometryPanelOpen]);

  const updateGeometryNumber = (key: GeometryNumberKey, value: number) => {
    if (!Number.isFinite(value)) return;
    if (key === "width" || key === "height") {
      const nextValue = Math.max(1, value);
      if (proportionLocked && aspectRatio > 0) {
        props.onUpdateObjectGeometry(
          key === "width"
            ? { width: nextValue, height: Math.max(1, nextValue / aspectRatio) }
            : { height: nextValue, width: Math.max(1, nextValue * aspectRatio) },
        );
        return;
      }
      props.onUpdateObjectGeometry({ [key]: nextValue });
      return;
    }
    props.onUpdateObjectGeometry({ [key]: value });
  };

  return (
    <>
      {props.snapGuides.map((guide, guideIndex) => (
        <div
          className="pointer-events-none absolute z-[4] bg-blue-500/80"
          key={`${guide.orientation}-${guide.position}-${guideIndex}`}
          role="presentation"
          style={
            guide.orientation === "vertical"
              ? {
                  left: guide.position * props.scale,
                  top: guide.start * props.scale,
                  width: 1,
                  height: Math.max(1, (guide.end - guide.start) * props.scale),
                }
              : {
                  left: guide.start * props.scale,
                  top: guide.position * props.scale,
                  width: Math.max(1, (guide.end - guide.start) * props.scale),
                  height: 1,
                }
          }
        />
      ))}
      {props.selectionBox ? (
        <>
          <div
            className={cx("absolute z-[3] border border-violet-500 shadow-none", !props.readOnly && props.activeObject?.movable ? "cursor-move" : "cursor-default")}
            style={{
              left: props.selectionBox.left,
              top: props.selectionBox.top,
              width: props.selectionBox.width,
              height: props.selectionBox.height,
              transform: `rotate(${props.selectionBox.rotation}deg)`,
              transformOrigin: "50% 50%",
            }}
            onPointerDown={props.readOnly ? undefined : props.onBeginDragObject}
            onDoubleClick={props.readOnly ? undefined : props.onDoubleClickSelection}
          >
            {props.readOnly ? null : resizeHandles.map((handle) => (
              <button
                aria-label={`Resize ${handle}`}
                className={cx("pointer-events-auto absolute size-2 rounded-full border border-violet-500 bg-white p-0 shadow-[0_1px_4px_rgba(0,0,0,0.18)]", resizeHandlePosition[handle])}
                data-handle={handle}
                key={handle}
                type="button"
                onPointerDown={(event) => props.onBeginResizeObject(handle, event)}
              />
            ))}
            {props.readOnly ? null : <button
              aria-label="Rotate object"
              className={cx(
                objectToolbarTooltip,
                "pointer-events-auto absolute grid size-6 -translate-x-1/2 place-items-center rounded-full border border-violet-500 bg-white p-0 text-violet-700 shadow-[0_4px_14px_rgba(0,0,0,0.18)] hover:bg-violet-50",
              )}
              data-tip="Rotate"
              style={{ left: "50%", top: "calc(100% + 12px)" }}
              type="button"
              title="Rotate object"
              onPointerDown={props.onBeginRotateObject}
            >
              <RotateCw size={13} />
            </button>}
          </div>
          {props.readOnly ? null : <div
            className="absolute z-[4] inline-flex h-[30px] -translate-x-1/2 -translate-y-[calc(100%_+_8px)] items-center gap-px overflow-visible rounded-md border border-black/8 bg-white p-[3px] shadow-[0_8px_22px_rgba(0,0,0,0.16)] [&>button]:grid [&>button]:size-[22px] [&>button]:place-items-center [&>button]:rounded-[5px] [&>button]:border-0 [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-black/58 [&>button:disabled]:cursor-default [&>button:disabled]:text-black/20 [&>button:hover:not(:disabled)]:bg-black/[0.06] [&>button:hover:not(:disabled)]:text-[#111]"
            ref={objectToolbarRef}
            style={{
              left: props.selectionBox.left + props.selectionBox.width / 2,
              top: props.selectionBox.top,
            }}
          >
            <button aria-label="Duplicate object" className={objectToolbarTooltip} data-tip="Duplicate" type="button" title="Duplicate object" onClick={props.onDuplicateObject}>
              <Copy size={13} />
            </button>
            <button aria-label="Delete object" className={objectToolbarTooltip} data-tip="Delete" type="button" title="Delete object" onClick={props.onDeleteObject}>
              <Trash2 size={13} />
            </button>
            <button aria-label="Move panel" className={objectToolbarTooltip} data-tip="Move" type="button" title="Move panel" onClick={() => setGeometryPanelOpen((open) => !open)}>
              <Move size={13} />
            </button>
          </div>}
          {!props.readOnly && geometryPanelOpen && props.activeGeometry ? (
            <ObjectGeometryPanel
              geometry={props.activeGeometry}
              panelRef={geometryPanelRef}
              position={geometryPanelPosition}
              proportionLocked={proportionLocked}
              onAlign={props.onAlignObject}
              onPointerDown={(event) => event.stopPropagation()}
              onToggleProportion={() => setProportionLocked((locked) => !locked)}
              onUpdateNumber={updateGeometryNumber}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function ObjectGeometryPanel(props: {
  geometry: DeckObjectGeometry;
  panelRef: RefObject<HTMLDivElement | null>;
  position: ToolbarFloatingMenuPosition;
  proportionLocked: boolean;
  onAlign: (alignment: DeckObjectAlignment) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onToggleProportion: () => void;
  onUpdateNumber: (key: GeometryNumberKey, value: number) => void;
}) {
  return createPortal(
    <div
      className="fixed z-50 w-[300px] overflow-y-auto rounded-lg border border-black/8 bg-white p-2.5 text-[#202124] shadow-[0_14px_38px_rgba(0,0,0,0.18)]"
      ref={props.panelRef}
      style={{
        left: props.position.left,
        top: props.position.top,
        maxHeight: props.position.maxHeight,
        width: props.position.width ?? geometryPanelWidth,
      }}
      onPointerDown={props.onPointerDown}
    >
      <div className="grid grid-cols-3 gap-1">
        {alignmentActions.map((action) => (
          <button
            className="flex h-8 items-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-left text-[11px] font-semibold text-black/70 hover:bg-black/[0.06] hover:text-black"
            key={action.value}
            type="button"
            onClick={() => props.onAlign(action.value)}
          >
            {action.icon}
            <span>{shortAlignmentLabel(action.label)}</span>
          </button>
        ))}
      </div>
      <div className="my-2 h-px bg-black/10" />
      <div className="grid grid-cols-[1fr_1fr_34px] items-end gap-1.5">
        <GeometryNumberInput label="W" value={props.geometry.width} onChange={(value) => props.onUpdateNumber("width", value)} />
        <GeometryNumberInput label="H" value={props.geometry.height} onChange={(value) => props.onUpdateNumber("height", value)} />
        <button
          className={cx(
            "grid h-8 place-items-center rounded-md border border-black/10 bg-[#f6f7f8] text-black/55 hover:bg-black/[0.06] hover:text-black",
            props.proportionLocked && "border-violet-500/40 bg-violet-50 text-violet-700",
          )}
          type="button"
          title={props.proportionLocked ? "Unlock proportion" : "Lock proportion"}
          onClick={props.onToggleProportion}
        >
          {props.proportionLocked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <GeometryNumberInput label="X" value={props.geometry.left} onChange={(value) => props.onUpdateNumber("left", value)} />
        <GeometryNumberInput label="Y" value={props.geometry.top} onChange={(value) => props.onUpdateNumber("top", value)} />
      </div>
    </div>,
    document.body,
  );
}

function GeometryNumberInput(props: { icon?: ReactNode; label: string; suffix?: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase leading-none text-black/42">{props.label}</span>
      <span className="flex h-8 min-w-0 items-center overflow-hidden rounded-md border border-black/10 bg-[#f6f7f8] focus-within:border-violet-500/50 focus-within:bg-white">
        {props.icon ? <span className="grid w-6 shrink-0 place-items-center text-black/45">{props.icon}</span> : null}
        <input
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[12px] font-semibold text-[#202124] outline-none"
          inputMode="decimal"
          type="number"
          value={formatGeometryNumber(props.value)}
          onChange={(event) => props.onChange(Number.parseFloat(event.currentTarget.value))}
        />
        <span className="shrink-0 pr-2 text-[10px] font-bold text-black/35">{props.suffix ?? "px"}</span>
      </span>
    </label>
  );
}

function shortAlignmentLabel(label: string) {
  return label.replace("Align ", "");
}

function formatGeometryNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return String(Math.round(value * 10) / 10).replace(/\.0$/, "");
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
