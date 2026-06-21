import type { KeyboardEvent, ReactNode } from "react";

type PromptComposerProps = {
  value: string;
  placeholder: string;
  canSubmit: boolean;
  beforeTextarea?: ReactNode;
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
  className?: string;
  footerClassName?: string;
  leadingActionsClassName?: string;
  textareaClassName?: string;
  trailingActionsClassName?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function PromptComposer(props: PromptComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (props.canSubmit) props.onSubmit();
  };

  return (
    <div className={cx("rounded-[20px] border border-white/10 bg-[#303030] p-4 shadow-[0_22px_80px_rgba(0,0,0,0.42)]", props.className)}>
      {props.beforeTextarea}
      <textarea
        className={cx("h-[108px] w-full resize-none border-0 bg-transparent px-1 text-[15px] leading-6 text-white outline-none placeholder:text-white/42", props.textareaClassName)}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
      />
      <div className={cx("flex items-center justify-between gap-3", props.footerClassName)}>
        <div className={cx("flex min-w-0 items-center gap-2", props.leadingActionsClassName)}>{props.leadingActions}</div>
        <div className={cx("flex shrink-0 items-center", props.trailingActionsClassName)}>{props.trailingActions}</div>
      </div>
    </div>
  );
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
