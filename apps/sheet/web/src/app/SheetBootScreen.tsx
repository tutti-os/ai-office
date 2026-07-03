import { Loader2 } from "lucide-react";

export function SheetBootScreen(props: { title: string; body: string; tone?: "loading" | "error"; onBackHome?: () => void; backLabel?: string }) {
  const isError = props.tone === "error";
  return (
    <div className="grid h-full min-h-screen w-full place-items-center bg-[#F4EFE6] p-8 text-center text-[#2A2620]">
      <div className="flex max-w-[420px] flex-col items-center gap-4">
        {isError ? null : <Loader2 className="animate-spin text-[#5C6B50]" size={28} />}
        <div>
          <div className="text-[15px] font-semibold">{props.title}</div>
          <div className="mt-2 text-[12px] leading-5 text-[#8B8275]">{props.body}</div>
        </div>
        {isError && props.onBackHome ? (
          <button
            type="button"
            className="rounded-md border border-[#C9B89D] bg-white px-4 py-2 text-[13px] font-medium text-[#2A2620] transition hover:border-[#5C6B50]"
            onClick={props.onBackHome}
          >
            {props.backLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
