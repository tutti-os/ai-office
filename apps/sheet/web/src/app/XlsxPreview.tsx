import { useEffect, useRef } from "react";
import { scrollbarClass } from "@ai-app/ui/app-shell";
import { XlsxRenderer } from "@tutti-os/office-preview/xlsx";
import "@tutti-os/office-preview/styles/xlsx.css";
import type { XlsxRenderWorkbook } from "@tutti-os/office-preview/xlsx";
import { useI18n } from "../i18n";

export function XlsxPreview(props: {
  workbook: XlsxRenderWorkbook | null;
  loading: boolean;
  error: string;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.cancelable || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>(".tsh-xlsx-canvas-scroll, .tsh-xlsx-tabs")
        : null;
      if (!target || !root.contains(target)) return;

      const maxScrollLeft = Math.max(0, target.scrollWidth - target.clientWidth);
      event.preventDefault();
      if (maxScrollLeft <= 0) return;

      const deltaX = normalizeWheelDeltaX(event, target.clientWidth);
      target.scrollLeft = Math.max(0, Math.min(maxScrollLeft, target.scrollLeft + deltaX));
    };

    root.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => root.removeEventListener("wheel", onWheel, { capture: true });
  }, [props.workbook]);

  if (props.loading) {
    return <PreviewState title={t("preview.loadingTitle")} body={t("preview.loadingBody")} />;
  }
  if (props.error) {
    return <PreviewState title={t("preview.errorTitle")} body={props.error} />;
  }
  if (!props.workbook) {
    return <PreviewState title={t("preview.emptyTitle")} body={t("preview.emptyBody")} />;
  }
  return (
    <div
      ref={rootRef}
      className={`h-full min-h-0 overflow-hidden bg-white ${scrollbarClass} [&_.tsh-xlsx-canvas-scroll]:bg-white [&_.tsh-xlsx-canvas-viewport]:min-h-0 [&_.tsh-xlsx-renderer]:h-full [&_.tsh-xlsx-renderer]:min-h-0`}
    >
      <XlsxRenderer workbook={props.workbook} />
    </div>
  );
}

function normalizeWheelDeltaX(event: WheelEvent, pageWidth: number) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaX * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaX * pageWidth;
  return event.deltaX;
}

function PreviewState(props: { title: string; body: string }) {
  return (
    <div className="grid h-full min-h-[320px] place-items-center bg-[#F4EFE6] p-8 text-center text-[#2A2620]">
      <div>
        <div className="text-[15px] font-semibold">{props.title}</div>
        <div className="mt-2 max-w-[420px] text-[12px] leading-5 text-[#8B8275]">{props.body}</div>
      </div>
    </div>
  );
}
