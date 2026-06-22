import { useRef } from "react";
import { FileSpreadsheet, History, Trash2, Upload } from "lucide-react";
import type { SheetProject } from "@ai-sheet/shared";
import { appShell, historyCardClass, historyClearButtonClass, historyDeleteButtonClass, historyEmptyIconClass, historyEmptyStateClass } from "@ai-app/ui/app-shell";

export function SheetHome(props: {
  projects: SheetProject[];
  loading: boolean;
  error: string;
  onClearHistory: () => void;
  onDeleteProject: (projectId: string) => void;
  onImportFile: (file: File) => void;
  onOpenProject: (project: SheetProject) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className={`h-full ${appShell.page}`}>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) props.onImportFile(file);
        }}
      />
      <button
        className={`absolute right-7 top-7 z-20 ${appShell.topAction}`}
        type="button"
        disabled={props.loading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} />
        Import XLSX
      </button>
      <div className={appShell.pageContent}>
        <section className="mx-auto flex w-full max-w-[820px] flex-col items-center">
          <div className={appShell.heroIcon}>
            <FileSpreadsheet size={18} />
          </div>
          <h1 className={appShell.heroTitle}>Open any workbook</h1>
          <div className="mt-8 flex w-full justify-center">
            <button
              className="flex h-12 items-center gap-2 rounded-[18px] bg-[#2A2620] px-5 text-[13px] font-semibold text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)] transition hover:bg-[#5C6B50] disabled:opacity-50"
              type="button"
              disabled={props.loading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={16} />
              Import XLSX workbook
            </button>
          </div>
          {props.error ? <div className={appShell.error}>{props.error}</div> : null}
        </section>
        <section className="mt-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex h-9 items-center gap-2 rounded-full bg-[#2A2620] px-4 text-[13px] font-medium text-[#F4EFE6]">
                <History size={15} />
                History
              </div>
              <div className="mt-2 text-[12px] font-medium text-[#8B8275]">{props.projects.length} projects</div>
            </div>
            <button
              className={historyClearButtonClass}
              type="button"
              disabled={props.loading || props.projects.length === 0}
              onClick={props.onClearHistory}
            >
              <Trash2 size={14} />
              Clear
            </button>
          </div>
          {props.projects.length ? (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {props.projects.map((project) => (
                <div key={project.id} className={`group ${historyCardClass()}`}>
                  <button
                    className="flex h-full w-full flex-col items-start p-4 text-left"
                    type="button"
                    onClick={() => props.onOpenProject(project)}
                  >
                    <div className="grid size-9 place-items-center rounded-[14px] bg-[#5C6B50] text-[#F4EFE6]">
                      <FileSpreadsheet size={17} />
                    </div>
                    <div className="mt-4 max-w-full truncate text-[14px] font-semibold text-[#2A2620]">{project.title}</div>
                    <div className="mt-1 text-[12px] font-medium text-[#8B8275]">{formatDate(project.updatedAt)}</div>
                  </button>
                  <button
                    className={historyDeleteButtonClass}
                    type="button"
                    title="Delete project"
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onDeleteProject(project.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={`mt-4 ${historyEmptyStateClass}`}>
              <div>
                <div className={`mx-auto mb-3 ${historyEmptyIconClass}`}>
                  <FileSpreadsheet size={17} />
                </div>
                <div className="text-[13px] font-semibold text-[#2A2620]">No workbooks yet</div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
