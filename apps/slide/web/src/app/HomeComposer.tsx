import { ArtifactHomeComposer, CodeFilledFormatIcon, PptFilledFormatIcon, type ArtifactHomeFormatOption } from "@ai-app/ui/home-composer";
import { contextAttachmentFileAccept } from "@ai-app/shared/context-attachments";
import type { LocalAgentTargetStatus, OfficeCliStatus, RuntimeProfile } from "@ai-slide/shared";
import { useI18n } from "../i18n";
import { AgentPromptRichTextInput } from "./AgentPromptRichTextInput";
import type { OutputType } from "../templates";
import type { HomeAttachment } from "./useHomeAttachments";

export function HomeComposer(props: {
  attachments: HomeAttachment[];
  creating: boolean;
  error: string;
  localAgentTargets: LocalAgentTargetStatus[];
  officeCliInstalling: boolean;
  officeCliStatus: OfficeCliStatus | null;
  outputType: OutputType;
  prompt: string;
  runtimeProfiles: RuntimeProfile[];
  selectedAgent: string;
  onAddFiles: (files: File[]) => void;
  onCreate: () => void;
  onInstallOfficeCli: () => void;
  onOutputTypeChange: (type: OutputType) => void;
  onPromptChange: (value: string) => void;
  onRemoveAttachment: (id: string) => void;
  onSelectedAgentChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const pptxAvailable = props.officeCliStatus?.available === true;
  const pptxInstalling = props.officeCliInstalling || props.officeCliStatus?.installing === true;
  const selectedOutputAvailable = props.outputType !== "pptx" || pptxAvailable;
  const canSubmit = (props.prompt.trim().length > 0 || props.attachments.length > 0) && !props.creating && selectedOutputAvailable;

  return (
    <ArtifactHomeComposer
      addFilesLabel={t("composer.addSourceFiles")}
      agentProfiles={props.runtimeProfiles}
      agentTargets={props.localAgentTargets}
      agentUnavailableLabel={t("composer.agentUnavailable")}
      acceptedFileTypes={contextAttachmentFileAccept}
      attachments={props.attachments}
      canSubmit={canSubmit}
      error={props.error}
      formatOptions={slideFormatOptions({
        officeCliStatus: props.officeCliStatus,
        pptxAvailable,
        pptxInstalling,
        t,
        onInstallOfficeCli: props.onInstallOfficeCli,
      })}
      loading={props.creating}
      placeholder={t("composer.placeholder")}
      prompt={props.prompt}
      selectedAgentId={props.selectedAgent}
      selectedFormatId={props.outputType}
      selectAgentLabel={t("composer.selectAgent")}
      submitLabel={t("composer.create")}
      renderPromptInput={(inputProps) => (
        <AgentPromptRichTextInput
          {...inputProps}
          className={`${inputProps.className} ai-slide-home-rich-text-editor`}
        />
      )}
      onAddFiles={props.onAddFiles}
      onFormatChange={props.onOutputTypeChange}
      onPromptChange={props.onPromptChange}
      onRemoveAttachment={props.onRemoveAttachment}
      onSelectedAgentChange={props.onSelectedAgentChange}
      onSubmit={props.onCreate}
    />
  );
}

function slideFormatOptions(input: {
  officeCliStatus: OfficeCliStatus | null;
  pptxAvailable: boolean;
  pptxInstalling: boolean;
  t: ReturnType<typeof useI18n>["t"];
  onInstallOfficeCli: () => void;
}): ArtifactHomeFormatOption<OutputType>[] {
  return [
    {
      id: "html",
      label: "Deck",
      description: input.t("composer.deckDescription"),
      icon: <CodeFilledFormatIcon />,
    },
    {
      id: "pptx",
      label: "PPTX",
      description: formatPptxOutputDescription(input.officeCliStatus, input.t),
      disabled: !input.pptxAvailable || input.pptxInstalling,
      downloadLabel: input.t("composer.downloadOfficeCli"),
      icon: <PptFilledFormatIcon />,
      installing: input.pptxInstalling,
      showInstall: !input.pptxAvailable && input.officeCliStatus?.canInstall === true,
      title: !input.pptxAvailable ? input.officeCliStatus?.reason ?? input.t("composer.officeCliRequired") : undefined,
      onInstall: input.onInstallOfficeCli,
    },
  ];
}

function formatPptxOutputDescription(officeCliStatus: OfficeCliStatus | null, t: ReturnType<typeof useI18n>["t"]) {
  if (!officeCliStatus) return t("composer.checkingOfficeCli");
  if (officeCliStatus.installing) return t("composer.installingOfficeCli");
  if (officeCliStatus.available) return t("composer.pptxDescription");
  return t("composer.officeCliInstallRequired");
}
