import { XlsxRenderer } from "@tutti-os/office-preview/xlsx";
import "@tutti-os/office-preview/styles/xlsx.css";
import type { XlsxRenderWorkbook } from "@tutti-os/office-preview/xlsx";

export function XlsxPreview(props: {
  workbook: XlsxRenderWorkbook | null;
  loading: boolean;
  error: string;
}) {
  if (props.loading) {
    return <PreviewState title="Loading workbook" body="Preparing the spreadsheet preview." />;
  }
  if (props.error) {
    return <PreviewState title="Unable to preview workbook" body={props.error} />;
  }
  if (!props.workbook) {
    return <PreviewState title="No workbook loaded" body="Import an XLSX workbook to view it here." />;
  }
  return (
    <div className="h-full min-h-0 overflow-auto bg-white">
      <XlsxRenderer workbook={props.workbook} />
    </div>
  );
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
