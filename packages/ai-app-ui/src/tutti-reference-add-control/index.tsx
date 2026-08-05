import { appendTuttiExternalReferenceSelections } from "@tutti-os/workspace-external-core/rich-text";
import type { TuttiExternalBridge } from "@tutti-os/workspace-external-core/contracts";
import { WorkspaceReferenceAddControl } from "@tutti-os/workspace-file-reference/ui";

export type TuttiReferenceAddControlLabels = {
  addContent: string;
  browseReferences: string;
  uploadFile: string;
};

export function TuttiReferenceAddControl(props: {
  className?: string;
  disabled?: boolean;
  labels: TuttiReferenceAddControlLabels;
  value: string;
  onChange: (value: string) => void;
  onError?: () => void;
  onUploadFile?: () => void;
}) {
  const references = getTuttiBridge()?.references;
  const selectReferences = references?.select;

  if (!selectReferences && !props.onUploadFile) return null;

  const browseReferences = selectReferences
    ? () => {
        void selectReferences()
          .then((selections) => {
            if (selections.length === 0) return;
            props.onChange(appendTuttiExternalReferenceSelections(props.value, selections));
          })
          .catch(() => props.onError?.());
      }
    : () => props.onUploadFile?.();

  return (
    <WorkspaceReferenceAddControl
      className={props.className}
      disabled={props.disabled}
      labels={{
        addContent: selectReferences ? props.labels.addContent : props.labels.uploadFile,
        browseReferences: props.labels.browseReferences,
        uploadFile: props.labels.uploadFile,
      }}
      onBrowseReferences={browseReferences}
      {...(selectReferences && props.onUploadFile ? { onUploadFile: props.onUploadFile } : {})}
    />
  );
}

function getTuttiBridge(): Partial<TuttiExternalBridge> | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { tuttiExternal?: Partial<TuttiExternalBridge> }).tuttiExternal;
}
