import type { KeyboardEvent, ReactNode } from "react";

export type PromptComposerInputRenderProps = {
  className: string;
  disabled: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

type PromptComposerProps = {
  value: string;
  placeholder: string;
  canSubmit: boolean;
  disabled?: boolean;
  beforeTextarea?: ReactNode;
  leadingActions?: ReactNode;
  trailingActions?: ReactNode;
  className?: string;
  footerClassName?: string;
  leadingActionsClassName?: string;
  textareaClassName?: string;
  trailingActionsClassName?: string;
  renderInput?: (props: PromptComposerInputRenderProps) => ReactNode;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function PromptComposer(props: PromptComposerProps) {
  const inputClassName = cx("h-[108px] w-full resize-none border-0 bg-transparent px-1 text-[15px] leading-6 text-white outline-none placeholder:text-white/42 disabled:cursor-not-allowed disabled:opacity-60", props.textareaClassName);
  const submitIfAllowed = () => {
    if (props.canSubmit) props.onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    submitIfAllowed();
  };

  return (
    <div className={cx("rounded-[16px] border border-[#B8A07C]/30 bg-[#303030] p-4 ", props.className)}>
      {props.beforeTextarea}
      {props.renderInput ? (
        props.renderInput({
          className: inputClassName,
          disabled: props.disabled ?? false,
          placeholder: props.placeholder,
          value: props.value,
          onChange: props.onChange,
          onSubmit: submitIfAllowed,
        })
      ) : (
        <textarea
          className={inputClassName}
          disabled={props.disabled}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
      )}
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
