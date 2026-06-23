import { useRef } from "react";
import { FileSpreadsheet, History, Sparkles, Upload } from "lucide-react";
import type { SheetProject } from "@ai-sheet/shared";
import {
  ArtifactHistoryPanel,
  ArtifactImportComposer,
  homeContentClass,
  homeHeroSectionClass,
  HomePageShell,
  HomeSectionHeader,
  homeTitleClass,
  HomeTopAction,
  homeWorkSectionClass,
} from "@ai-app/ui/app-shell";

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
  const openImportPicker = () => inputRef.current?.click();

  return (
    <HomePageShell>
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
      <HomeTopAction disabled={props.loading} icon={<Upload size={14} />} onClick={openImportPicker}>
        Import
      </HomeTopAction>
      <div className={homeContentClass}>
        <section className={homeHeroSectionClass}>
          <h1 className={homeTitleClass}>Open a workbook</h1>
          <ArtifactImportComposer
            actionDescription="Render and edit the workbook source directly."
            actionLabel="Import XLSX workbook"
            error={props.error}
            formatDescription="Workbook artifact"
            formatIcon={<FileSpreadsheet size={20} />}
            formatLabel="XLSX"
            formatOptions={[
              {
                active: true,
                description: "Workbook artifact",
                icon: <FileSpreadsheet size={20} />,
                label: "XLSX",
              },
              {
                active: false,
                description: "AI-native spreadsheet",
                disabled: true,
                icon: <Sparkles size={20} />,
                label: "Smart Sheet",
                statusLabel: "Coming soon",
              },
            ]}
            loading={props.loading}
            onImport={openImportPicker}
          />
        </section>

        <section className={homeWorkSectionClass}>
          <HomeSectionHeader
            countText={`${props.projects.length} workbooks`}
            icon={<History size={15} />}
            label="Recent"
          />
          <ArtifactHistoryPanel
            emptyDescription="Import an XLSX file to see it here."
            emptyIcon={<History size={17} />}
            emptyTitle="No workbooks yet"
            getId={(project) => project.id}
            getSubtitle={() => "XLSX workbook"}
            getTitle={(project) => project.title}
            getUpdatedAt={(project) => project.updatedAt}
            icon={<FileSpreadsheet size={15} />}
            loading={props.loading}
            projects={props.projects}
            onClearHistory={props.onClearHistory}
            onDeleteProject={props.onDeleteProject}
            onOpenProject={props.onOpenProject}
          />
        </section>
      </div>
    </HomePageShell>
  );
}
