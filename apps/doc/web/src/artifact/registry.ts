import type { ArtifactType } from "@ai-doc/shared";

export type ArtifactRuntimeDescriptor = {
  type: ArtifactType;
  label: string;
  status: "ready" | "planned";
};

export const artifactRuntimeDescriptors: ArtifactRuntimeDescriptor[] = [
  { type: "html", label: "HTML", status: "ready" },
  { type: "markdown", label: "Markdown", status: "ready" },
  { type: "docx", label: "DOCX", status: "ready" },
];

export function getArtifactRuntimeDescriptor(type: ArtifactType) {
  return artifactRuntimeDescriptors.find((descriptor) => descriptor.type === type) ?? artifactRuntimeDescriptors[0];
}
