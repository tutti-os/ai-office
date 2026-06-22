import type { ReactNode } from "react";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const appShell = {
  page:
    "relative overflow-auto bg-[linear-gradient(90deg,rgba(42,38,32,0.045)_1px,transparent_1px),linear-gradient(180deg,rgba(42,38,32,0.04)_1px,transparent_1px)] bg-[size:28px_28px] text-[#2A2620] [color-scheme:light]",
  pageContent: "mx-auto flex w-full max-w-[1220px] flex-col px-7 pb-16 pt-14",
  heroIcon:
    "mb-5 grid size-10 place-items-center rounded-full border border-[#B8A07C]/70 bg-[#F4EFE6]/82 text-[#5C6B50] shadow-[0_12px_10px_rgba(0,0,0,0.08)] backdrop-blur transition-colors",
  heroTitle:
    "w-[calc(100vw-56px)] max-w-[1180px] whitespace-nowrap text-center text-[20px] font-semibold leading-6 text-[#2A2620] sm:text-[36px] sm:leading-10 md:text-[48px] md:leading-[52px] lg:text-[62px] lg:leading-[66px] xl:text-[68px] xl:leading-[72px]",
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
    "grid size-9 shrink-0 place-items-center rounded-full bg-[#2A2620] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)] transition-colors",
  submitAction:
    "grid size-10 place-items-center rounded-full bg-[#2A2620] text-[#F4EFE6] shadow-[0_12px_10px_rgba(0,0,0,0.08)] transition-colors disabled:bg-[#B8A07C]/32 disabled:text-[#8B8275]",
  cardShadow: "shadow-[0_22px_18px_rgba(0,0,0,0.06),0_42px_33px_rgba(0,0,0,0.07)]",
  softShadow: "shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
};

export function homePanelButtonClass(active: boolean) {
  return cx(
    "flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-medium transition-colors",
    active
      ? "bg-[#2A2620] text-[#F4EFE6]"
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
    active && "border-[#F4EFE6] bg-[#F4EFE6] text-[#2A2620] shadow-[0_12px_10px_rgba(0,0,0,0.08)]",
    disabled && "border-[#E6DDCD]/12 bg-[#2A2620]/10 text-[#F4EFE6]/40",
    !active && !disabled && "border-[#E6DDCD]/20 bg-[#F4EFE6]/10 text-[#F4EFE6]/86 hover:border-[#F4EFE6]/42 hover:bg-[#F4EFE6]/16",
  );
}

export function formatOptionIconClass(active: boolean, disabled?: boolean) {
  return cx(
    "grid size-9 shrink-0 place-items-center rounded-[14px]",
    active && "bg-[#2A2620] text-[#F4EFE6]",
    disabled && "bg-[#F4EFE6]/5 text-[#F4EFE6]/28",
    !active && !disabled && "bg-[#F4EFE6]/12 text-[#F4EFE6]/70",
  );
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
