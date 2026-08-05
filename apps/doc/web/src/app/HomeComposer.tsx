import { ArtifactHomeComposer, CodeFilledFormatIcon, MarkdownFilledFormatIcon, ProductFilledFormatIcon, type ArtifactHomeFormatOption } from "@ai-app/ui/home-composer";
import { appShell } from "@ai-app/ui/app-shell";
import { TuttiReferenceAddControl } from "@ai-app/ui/tutti-reference-add-control";
import { contextAttachmentFileAccept } from "@ai-app/shared/context-attachments";
import type { DocumentType, LocalAgentTargetStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { useI18n } from "../i18n";
import { AgentPromptRichTextInput } from "./AgentPromptRichTextInput";
import { ParentPathPicker } from "./ParentPathPicker";
import type { HomeAttachment } from "./useHomeAttachments";

export function HomeComposer(props: {
  attachments: HomeAttachment[];
  error: string;
  loading: boolean;
  localAgentTargets: LocalAgentTargetStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  outputType: DocumentType;
  parentPath?: string;
  prompt: string;
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  showParentPath?: boolean;
  onAddFiles: (files: File[]) => void;
  onCreateFromPrompt: () => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: DocumentType) => void;
  onParentPathChange?: (value: string) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRuntimeProfileChange: (profileId: string) => void;
}) {
  const { t } = useI18n();
  const docxAvailable = props.officeCliStatus?.available === true;
  const docxInstalling = props.officeCliInstalling || props.officeCliStatus?.installing === true;
  const selectedOutputAvailable = props.outputType !== "docx" || docxAvailable;
  const canSubmit = !props.loading && selectedOutputAvailable && (props.prompt.trim().length > 0 || props.attachments.length > 0);

  return (
    <div className="flex w-full flex-col">
      <ArtifactHomeComposer
        addFilesLabel={t("composer.addContext")}
        agentProfiles={props.runtimeProfiles}
        agentTargets={props.localAgentTargets}
        agentUnavailableLabel={t("composer.agentUnavailable")}
        acceptedFileTypes={contextAttachmentFileAccept}
        attachments={props.attachments}
        canSubmit={canSubmit}
        error={props.error}
        formatOptions={documentFormatOptions({
          docxAvailable,
          docxInstalling,
          officeCliStatus: props.officeCliStatus,
          t,
          onInstallOfficeCli: props.onInstallOfficeCli,
        })}
        loading={props.loading}
        placeholder={t("composer.placeholder")}
        prompt={props.prompt}
        selectedAgentId={props.selectedRuntimeProfileId}
        selectedFormatId={props.outputType}
        selectAgentLabel={t("composer.selectAgent")}
        submitLabel={t("composer.create")}
        leadingActionsExtra={
          props.showParentPath ? (
            <ParentPathPicker
              disabled={props.loading}
              linkExistingLabel={t("composer.linkExistingProject")}
              parentPath={props.parentPath ?? "/workspace"}
              placeholder={t("composer.parentPathLabel")}
              title={t("composer.parentPathHint")}
              workspaceRootLabel={t("composer.workspaceRoot")}
              onParentPathChange={(value) => props.onParentPathChange?.(value)}
            />
          ) : null
        }
        renderAddContentAction={({ disabled, onUploadFile }) => (
          <TuttiReferenceAddControl
            className={appShell.iconAction}
            disabled={disabled}
            labels={{
              addContent: t("composer.addContent"),
              browseReferences: t("composer.browseReferences"),
              uploadFile: t("composer.addContext"),
            }}
            value={props.prompt}
            onChange={props.onPromptChange}
            onUploadFile={onUploadFile}
          />
        )}
        renderPromptInput={(inputProps) => (
          <AgentPromptRichTextInput
            {...inputProps}
            className={`${inputProps.className} ai-doc-home-rich-text-editor`}
          />
        )}
        onAddFiles={props.onAddFiles}
        onFormatChange={props.onOutputTypeChange}
        onPromptChange={props.onPromptChange}
        onRemoveAttachment={props.onRemoveAttachment}
        onSelectedAgentChange={props.onRuntimeProfileChange}
        onSubmit={props.onCreateFromPrompt}
      />
    </div>
  );
}

function documentFormatOptions(input: {
  docxAvailable: boolean;
  docxInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  t: ReturnType<typeof useI18n>["t"];
  onInstallOfficeCli: () => void;
}): ArtifactHomeFormatOption<DocumentType>[] {
  return [
    {
      id: "html",
      label: "HTML",
      description: input.t("composer.htmlDescription"),
      icon: <CodeFilledFormatIcon />,
    },
    {
      id: "markdown",
      label: "Markdown",
      description: input.t("composer.markdownDescription"),
      icon: <MarkdownFilledFormatIcon />,
    },
    {
      id: "docx",
      label: "Word",
      description: formatDocxOutputDescription(input.officeCliStatus, input.t),
      disabled: !input.docxAvailable || input.docxInstalling,
      downloadLabel: input.t("composer.downloadOfficeCli"),
      icon: <ProductFilledFormatIcon />,
      installing: input.docxInstalling,
      showInstall: !input.docxAvailable && input.officeCliStatus?.canInstall === true,
      title: !input.docxAvailable ? input.officeCliStatus?.reason ?? input.t("composer.officeCliRequired") : undefined,
      onInstall: input.onInstallOfficeCli,
    },
  ];
}

function formatDocxOutputDescription(officeCliStatus: OfficeCliStatus | null, t: ReturnType<typeof useI18n>["t"]) {
  if (!officeCliStatus) return t("composer.checkingOfficeCli");
  if (officeCliStatus.installing) return t("composer.installingOfficeCli");
  if (!officeCliStatus.available) return t("composer.officeCliInstallRequired");
  return t("composer.wordDescription");
}
