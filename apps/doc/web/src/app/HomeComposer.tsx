import { ArtifactHomeComposer, CodeFilledFormatIcon, MarkdownFilledFormatIcon, ProductFilledFormatIcon, type ArtifactHomeFormatOption } from "@ai-app/ui/home-composer";
import { contextAttachmentFileAccept } from "@ai-app/shared/context-attachments";
import type { DocumentType, LocalAgentTargetStatus, OfficeCliStatus, RuntimeProfile } from "@ai-doc/shared";
import { useI18n } from "../i18n";
import { AgentPromptRichTextInput } from "./AgentPromptRichTextInput";
import type { HomeAttachment } from "./useHomeAttachments";

export function HomeComposer(props: {
  attachments: HomeAttachment[];
  error: string;
  loading: boolean;
  localAgentTargets: LocalAgentTargetStatus[];
  localAgentTargetsLoaded: boolean;
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  outputType: DocumentType;
  prompt: string;
  runtimeProfiles: RuntimeProfile[];
  selectedRuntimeProfileId: string;
  onAddFiles: (files: File[]) => void;
  onCreateFromPrompt: () => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: DocumentType) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onRuntimeProfileChange: (profileId: string) => void;
  onRefreshAgents: () => void;
}) {
  const { t } = useI18n();
  const docxAvailable = props.officeCliStatus?.available === true;
  const docxInstalling = props.officeCliInstalling || props.officeCliStatus?.installing === true;
  const selectedOutputAvailable = props.outputType !== "docx" || docxAvailable;
  const canSubmit = !props.loading && selectedOutputAvailable && (props.prompt.trim().length > 0 || props.attachments.length > 0);

  return (
    <ArtifactHomeComposer
      addFilesLabel={t("composer.addContext")}
      agentProfiles={props.runtimeProfiles}
      agentTargets={props.localAgentTargets}
      agentUnavailableLabel={t("composer.agentUnavailable")}
      agentCatalogLoading={!props.localAgentTargetsLoaded}
      loadingAgentsLabel="Loading Agents…"
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
      refreshAgentsLabel="Refresh Agents"
      submitLabel={t("composer.create")}
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
      onRefreshAgents={props.onRefreshAgents}
      onSubmit={props.onCreateFromPrompt}
    />
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
