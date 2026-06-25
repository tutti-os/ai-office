import type { ReactNode } from "react";
import { Check, Clock3, History, Loader2, Trash2, Upload } from "lucide-react";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const scrollbarClass =
  "[scrollbar-color:rgba(92,107,80,0.54)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:size-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[#5C6B50]/45 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-[#5C6B50]/62";

export const darkScrollbarClass =
  "[scrollbar-color:rgba(255,255,255,0.32)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:size-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/28 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-white/40";

export const appShell = {
  page:
    cx(
      "relative overflow-auto bg-[linear-gradient(90deg,rgba(42,38,32,0.045)_1px,transparent_1px),linear-gradient(180deg,rgba(42,38,32,0.04)_1px,transparent_1px)] bg-[size:28px_28px] text-[#2A2620] [color-scheme:light]",
      scrollbarClass,
    ),
  topAction:
    "flex h-9 items-center gap-2 rounded-full bg-[#F4EFE6] px-4 text-[12px] font-medium text-[#2A2620] shadow-[0_12px_10px_rgba(0,0,0,0.08)] transition hover:text-[#5C6B50]",
  countText: "text-[12px] font-medium text-[#8B8275]",
  searchShell:
    "flex h-[38px] w-full items-center gap-2 rounded-full border border-[#B8A07C]/55 bg-[#F4EFE6]/55 px-3.5 text-[#8B8275] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors md:w-[min(340px,42vw)]",
  searchInput:
    "min-w-0 flex-1 border-0 bg-transparent text-[13px] font-medium text-[#2A2620] outline-none placeholder:text-[#8B8275]",
  error:
    "mt-4 w-full rounded-2xl border border-[#B8A07C]/50 bg-[#F4EFE6]/80 p-3 text-left text-[12px] leading-5 text-[#7B2E24]",
  promptFrame:
    "mt-8 w-full rounded-[21px] bg-gradient-to-br from-[#5C6B50] to-[#37362F] p-px shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)]",
  promptInner: "rounded-[20px] bg-[#5C6B50]/82 p-4 backdrop-blur",
  promptComposer: "border-[#D8CDB9]/70! bg-[#F4EFE6]/92! shadow-[0_1px_2px_rgba(0,0,0,0.05)]!",
  promptTextarea: "text-[#2A2620]! placeholder:text-[#8B8275]!",
  iconAction:
    "grid size-9 shrink-0 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)] transition-colors hover:bg-[#4C5E42]",
  submitAction:
    "grid size-10 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)] transition-colors hover:bg-[#4C5E42] disabled:bg-[#D8CDB9]/70 disabled:text-[#8B8275] disabled:shadow-none",
  cardShadow: "shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)]",
  softShadow: "shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
};

export const homeTitleClass =
  "w-[calc(100vw-56px)] max-w-[1180px] whitespace-nowrap text-center text-[20px] font-semibold leading-6 text-[#2A2620] sm:text-[34px] sm:leading-[38px] md:text-[44px] md:leading-[48px] lg:text-[54px] lg:leading-[58px] xl:text-[58px] xl:leading-[62px]";
export const homeContentClass = "mx-auto flex w-full max-w-[1220px] flex-col px-7 pb-16 pt-10";
export const homeHeroSectionClass = "mx-auto flex w-full max-w-[820px] flex-col items-center";
export const homeWorkSectionClass = "mt-6";

export type ArtifactHistoryCopy = {
  clearHistory: string;
  deleteProject: string;
  deleteProjectAria: (title: string) => string;
  openProjectAria: (title: string) => string;
};

export const defaultArtifactHistoryCopy: ArtifactHistoryCopy = {
  clearHistory: "Clear history",
  deleteProject: "Delete project",
  deleteProjectAria: (title) => `Delete ${title}`,
  openProjectAria: (title) => `Open ${title}`,
};

export function HomePageShell(props: { children: ReactNode; className?: string }) {
  return <div className={cx("h-full", appShell.page, props.className)}>{props.children}</div>;
}

export function HomeTopAction(props: {
  children: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cx("absolute right-7 top-6 z-20", appShell.topAction, "disabled:opacity-50")}
      type="button"
      disabled={props.disabled}
      title={props.title}
      onClick={props.onClick}
    >
      {props.icon}
      {props.children}
    </button>
  );
}

export function HomePanelToggle(props: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={homePanelButtonClass(props.active)} type="button" onClick={props.onClick}>
      {props.icon}
      {props.label}
    </button>
  );
}

export function HomeCategoryPill(props: {
  active: boolean;
  count?: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={cx(categoryPillClass(props.active), "inline-flex items-center gap-2")} type="button" onClick={props.onClick}>
      <span>{props.label}</span>
      {typeof props.count === "number" ? <small className={props.active ? "text-[#F4EFE6]/58" : "text-[#8B8275]"}>{props.count}</small> : null}
    </button>
  );
}

export function homePanelButtonClass(active: boolean) {
  return cx(
    "flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors",
    active
      ? "bg-[#5C6B50] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)]"
      : "border border-[#B8A07C]/55 bg-[#F4EFE6]/44 text-[#2A2620]/68 hover:text-[#5C6B50]",
  );
}

export function categoryPillClass(active: boolean) {
  return cx(
    "h-8 shrink-0 rounded-full px-4 text-[12px] font-medium transition-colors",
    active
      ? "bg-[#5C6B50] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)]"
      : "border border-[#B8A07C]/55 bg-[#F4EFE6]/50 text-[#2A2620]/72 hover:text-[#5C6B50]",
  );
}

export function formatOptionClass(active: boolean, disabled?: boolean) {
  return cx(
    "flex min-h-16 items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-colors",
    active && "border-[#D8CDB9]/80 bg-[#F4EFE6] text-[#2A2620] shadow-[0_12px_10px_rgba(0,0,0,0.08)]",
    disabled && "border-[#D8CDB9]/60 bg-[#E6DDCD]/58 text-[#8B8275]",
    !active && !disabled && "border-[#E6DDCD]/20 bg-[#F4EFE6]/10 text-[#F4EFE6]/86 hover:border-[#F4EFE6]/42 hover:bg-[#F4EFE6]/16",
  );
}

export function formatOptionIconClass(active: boolean, disabled?: boolean) {
  return cx(
    "grid size-9 shrink-0 place-items-center rounded-[14px]",
    active && "bg-[#5C6B50] text-[#F4EFE6]",
    disabled && "bg-[#D8CDB9]/64 text-[#8B8275]",
    !active && !disabled && "bg-[#F4EFE6]/12 text-[#F4EFE6]/70",
  );
}

export function ArtifactFormatOption(props: {
  active?: boolean;
  description: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  statusLabel?: string;
}) {
  const active = props.active ?? true;
  return (
    <div className={cx(formatOptionClass(active, props.disabled), "!min-h-[56px] !px-3 !py-2.5")}>
      <span className={formatOptionIconClass(active, props.disabled)}>{props.icon}</span>
      <span className="mr-auto grid min-w-0 flex-1 gap-1">
        <span className="truncate text-[14px] font-bold leading-none">{props.label}</span>
        <small className={cx("truncate text-[12px] font-medium", active ? "text-[#8B8275]" : props.disabled ? "text-[#8B8275]/72" : "text-[#E6DDCD]/62")}>
          {props.description}
        </small>
      </span>
      {active ? (
        <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
          <Check size={14} />
        </span>
      ) : props.statusLabel ? (
        <span className="ml-auto shrink-0 rounded-full border border-[#B8A07C]/45 bg-[#F4EFE6]/46 px-2.5 py-1 text-[11px] font-medium text-[#8B8275]">
          {props.statusLabel}
        </span>
      ) : null}
    </div>
  );
}

export type ArtifactImportFormatOption = {
  active?: boolean;
  description: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  statusLabel?: string;
};

export function ArtifactImportComposer(props: {
  actionDescription: string;
  actionLabel: string;
  error?: string;
  formatDescription: string;
  formatIcon: ReactNode;
  formatLabel: string;
  formatOptions?: ArtifactImportFormatOption[];
  loading?: boolean;
  onImport: () => void;
}) {
  const formatOptions = props.formatOptions ?? [
    {
      active: true,
      description: props.formatDescription,
      icon: props.formatIcon,
      label: props.formatLabel,
    },
  ];

  return (
    <div className={cx(appShell.promptFrame, "!mt-6")}>
      <div className={cx(appShell.promptInner, "!p-3.5")}>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {formatOptions.map((option) => (
            <ArtifactFormatOption
              active={option.active}
              description={option.description}
              disabled={option.disabled}
              icon={option.icon}
              key={option.label}
              label={option.label}
              statusLabel={option.statusLabel}
            />
          ))}
        </div>
        <button
          className={cx(
            appShell.promptComposer,
            "mt-2 flex min-h-[118px] w-full flex-col items-center justify-center gap-3 rounded-[17px] border border-dashed border-[#B8A07C]/70 bg-[#F4EFE6]/92 p-5 text-center text-[#2A2620] transition-colors hover:border-[#5C6B50]/60 disabled:opacity-60",
          )}
          type="button"
          disabled={props.loading}
          onClick={props.onImport}
        >
          <span className="grid size-10 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
            {props.loading ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
          </span>
          <span className="grid gap-1">
            <strong className="text-[14px] font-semibold">{props.actionLabel}</strong>
            <small className="text-[12px] font-medium text-[#8B8275]">{props.actionDescription}</small>
          </span>
        </button>
        {props.error ? <div className={appShell.error}>{props.error}</div> : null}
      </div>
    </div>
  );
}

export function HomeSectionHeader(props: {
  countText: string;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-full bg-[#5C6B50] px-4 text-[13px] font-medium text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)]">
            {props.icon}
            {props.label}
          </div>
        </div>
        <div className={appShell.countText}>{props.countText}</div>
      </div>
    </div>
  );
}

export function ArtifactHistoryPanel<Project>(props: {
  clearLabel?: string;
  copy?: Partial<ArtifactHistoryCopy>;
  emptyDescription: string;
  emptyIcon?: ReactNode;
  emptyTitle: string;
  getId: (project: Project) => string;
  getPreview?: (project: Project) => string;
  getSubtitle: (project: Project) => string;
  getTitle: (project: Project) => string;
  getUpdatedAt: (project: Project) => string;
  icon: ReactNode | ((project: Project) => ReactNode);
  loading: boolean;
  projects: Project[];
  onClearHistory: () => void;
  onDeleteProject: (projectId: string) => void;
  onOpenProject: (project: Project) => void;
}) {
  const copy = { ...defaultArtifactHistoryCopy, ...props.copy };
  if (props.projects.length === 0) {
    return (
      <div className="mt-5">
        <ArtifactHistoryActions
          clearLabel={props.clearLabel}
          copy={copy}
          loading={props.loading}
          projectCount={props.projects.length}
          onClearHistory={props.onClearHistory}
        />
        <ArtifactHistoryEmptyState
          description={props.emptyDescription}
          icon={props.emptyIcon ?? <History size={17} />}
          title={props.emptyTitle}
        />
      </div>
    );
  }

  return (
    <div className="mt-5">
      <ArtifactHistoryActions
        clearLabel={props.clearLabel}
        copy={copy}
        loading={props.loading}
        projectCount={props.projects.length}
        onClearHistory={props.onClearHistory}
      />
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {props.projects.map((project) => {
          const id = props.getId(project);
          const icon = typeof props.icon === "function" ? props.icon(project) : props.icon;
          return (
            <ArtifactHistoryCard
              id={id}
              copy={copy}
              icon={icon}
              key={id}
              preview={props.getPreview?.(project)}
              subtitle={props.getSubtitle(project)}
              title={props.getTitle(project)}
              updatedAt={props.getUpdatedAt(project)}
              onDelete={props.onDeleteProject}
              onOpen={() => props.onOpenProject(project)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ArtifactHistoryActions(props: {
  clearLabel?: string;
  copy: ArtifactHistoryCopy;
  loading: boolean;
  projectCount: number;
  onClearHistory: () => void;
}) {
  return (
    <div className={historyActionsClass}>
      <button
        className={historyClearButtonClass}
        type="button"
        disabled={props.loading || props.projectCount === 0}
        title={props.clearLabel ?? props.copy.clearHistory}
        onClick={props.onClearHistory}
      >
        <Trash2 size={13} />
        {props.clearLabel ?? props.copy.clearHistory}
      </button>
    </div>
  );
}

function ArtifactHistoryCard(props: {
  copy: ArtifactHistoryCopy;
  id: string;
  icon: ReactNode;
  preview?: string;
  subtitle: string;
  title: string;
  updatedAt: string;
  onDelete: (projectId: string) => void;
  onOpen: () => void;
}) {
  return (
    <div className={cx("group", historyCardClass())}>
      <button
        aria-label={props.copy.openProjectAria(props.title)}
        className="block h-full min-h-[132px] w-full rounded-[20px] p-4 text-left"
        type="button"
        onClick={props.onOpen}
      >
        <div className="pr-12">
          <div className="truncate text-[13px] font-medium text-[#2A2620]">{props.title}</div>
          <div className="mt-1 truncate text-[11px] text-[#8B8275]">{props.subtitle}</div>
        </div>
        {props.preview ? <p className="mt-4 line-clamp-2 text-[12px] leading-5 text-[#2A2620]/62">{props.preview}</p> : null}
        <div className={cx(props.preview ? "mt-4 pr-9" : "mt-5", "flex items-center gap-1.5 text-[11px] text-[#8B8275]")}>
          <Clock3 size={12} />
          {formatArtifactDate(props.updatedAt)}
        </div>
      </button>
      <div className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]">
        {props.icon}
      </div>
      <button
        aria-label={props.copy.deleteProjectAria(props.title)}
        className={historyDeleteButtonClass}
        type="button"
        title={props.copy.deleteProject}
        onClick={() => props.onDelete(props.id)}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function ArtifactHistoryEmptyState(props: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className={cx("mt-3", historyEmptyStateClass)}>
      <div>
        <div className={`mx-auto mb-3 ${historyEmptyIconClass}`}>{props.icon}</div>
        <div className="text-[13px] font-semibold text-[#2A2620]">{props.title}</div>
        <div className="mt-1 text-[12px] font-medium text-[#8B8275]">{props.description}</div>
      </div>
    </div>
  );
}

function formatArtifactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function templateCardClass() {
  return "relative overflow-hidden rounded-[20px] bg-[#F4EFE6] text-left text-[#2A2620] shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)] ring-1 ring-[#B8A07C]/45 transition hover:-translate-y-0.5 hover:shadow-[0_12px_10px_rgba(0,0,0,0.08)]";
}

export function historyCardClass() {
  return "relative min-h-[132px] rounded-[20px] border border-[#B8A07C]/50 bg-[#F4EFE6]/58 shadow-[0_1px_2px_rgba(0,0,0,0.05)] backdrop-blur transition hover:-translate-y-0.5 hover:shadow-[0_12px_10px_rgba(0,0,0,0.08)]";
}

export const historyActionsClass = "flex items-center justify-start";
export const historyClearButtonClass =
  "flex h-8 items-center gap-2 rounded-full border border-[#B8A07C]/55 bg-[#F4EFE6]/55 px-3 text-[12px] font-medium text-[#8B8275] transition hover:border-[#5C6B50]/50 hover:text-[#5C6B50] disabled:cursor-not-allowed disabled:opacity-40";
export const historyDeleteButtonClass =
  "absolute bottom-3 right-3 grid size-7 place-items-center rounded-[16px] border border-[#B8A07C]/55 bg-[#F4EFE6]/70 text-[#8B8275] opacity-0 transition hover:border-[#5C6B50]/50 hover:text-[#5C6B50] focus-visible:opacity-100 group-hover:opacity-100";
export const historyEmptyStateClass =
  "grid min-h-[220px] place-items-center gap-2 rounded-[20px] border border-[#B8A07C]/55 bg-[#F4EFE6]/50 p-7 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)] backdrop-blur";
export const historyEmptyIconClass = "grid size-9 place-items-center rounded-full bg-[#5C6B50] text-[#F4EFE6]";

export function AgentSelectShell(props: { children: ReactNode }) {
  return (
    <label className="relative mr-auto flex h-9 w-auto flex-1 basis-[150px] items-center md:w-[168px] md:flex-none md:basis-auto">
      {props.children}
    </label>
  );
}
