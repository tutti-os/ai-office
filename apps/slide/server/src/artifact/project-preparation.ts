import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SlideArtifact, SlideProject } from "@ai-slide/shared";
import {
  type ProjectPreparationFailure,
  SqliteProjectPreparationCoordinator,
  withProjectPreparationPhase,
} from "@ai-app/shared/project-preparation";
import { getDb } from "../db/database.js";
import { projectWorkspaceRoot } from "../local/paths.js";
import type { TemplateDeckSource } from "../templates/template-service.js";
import {
  materializeDeckProject,
  materializePptxProject,
  prepareProjectAgentFiles,
  projectAgentInstructionsVersion,
} from "./project-materialization.js";

export class SlideProjectPreparation {
  private readonly durable = new SqliteProjectPreparationCoordinator(getDb, "ai-slide");

  getStatus(projectId: string) {
    return this.durable.getStatus(projectId);
  }

  markCore(projectId: string, state: "preparing" | "ready" | "failed", error?: ProjectPreparationFailure) {
    this.durable.markCore(projectId, state, error);
  }

  invalidateAgentContext(projectId: string) {
    this.durable.invalidateAgentContext(projectId);
  }

  async ensureAgentContext(project: SlideProject, artifact: SlideArtifact) {
    await this.durable.ensureAgentContext({
      projectId: project.id,
      baseVersion: projectAgentInstructionsVersion(project, artifact),
      prepare: () => prepareAgentContext(project, artifact),
    });
  }

  startAgentContext(project: SlideProject, artifact: SlideArtifact) {
    this.durable.startAgentContext({
      projectId: project.id,
      baseVersion: projectAgentInstructionsVersion(project, artifact),
      fallbackPath: projectWorkspaceRoot(project.id),
      prepare: () => prepareAgentContext(project, artifact),
    });
  }
}

export async function materializeSlideProjectCore(
  project: SlideProject,
  artifact: SlideArtifact,
  templateSource: TemplateDeckSource | null = null,
) {
  const root = projectWorkspaceRoot(project.id);
  await mkdir(root, { recursive: true });
  await withProjectPreparationPhase("core_artifact", join(root, artifact.fileRef), () => (
    artifact.type === "deck"
      ? materializeDeckProject(root, project, artifact, templateSource)
      : materializePptxProject(root, project, artifact)
  ));
}

async function prepareAgentContext(project: SlideProject, artifact: SlideArtifact) {
  const root = projectWorkspaceRoot(project.id);
  await mkdir(root, { recursive: true });
  await prepareProjectAgentFiles(root, project, artifact);
}
