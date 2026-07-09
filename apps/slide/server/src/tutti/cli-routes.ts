import { readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import { cliErrorOutput, cliJsonOutput, readCliInputBody } from "@ai-app/shared/tutti-cli";
import { runtimeProfileIdFromProvider } from "@ai-app/shared/agent-providers";
import type { AiEditMode, DeckManifestSlide, OpenSlideCliResponse, SlideArtifact, SlideArtifactType, SlideProject } from "@ai-slide/shared";
import { getDefaultAgentProvider, getTuttiCliStatus, openTuttiAppRoute } from "./tutti-cli.js";
import type { ProjectService } from "../artifact/project-service.js";
import { installOfficeCli } from "../toolchains/officecli.js";

export function registerTuttiCliRoutes(server: FastifyInstance, projects: ProjectService) {
  server.post("/tutti/cli/status", async (_request, reply) => {
    const projectRows = projects.listProjects().projects;
    const providers = await projects.listLocalAgentProviders().catch(() => ({ providers: [] }));
    const latestProject = projectRows[0] ?? null;
    return reply.send(cliJsonOutput({
      ok: true,
      appId: "ai-slide",
      version: process.env.AI_SLIDE_APP_VERSION ?? "0.0.0",
      projectCount: projectRows.length,
      runtimeProviderCount: providers.providers.length,
      latestProject: latestProject ? projectSummary(latestProject) : null,
      tuttiCli: await getTuttiCliStatus(),
    }));
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const limit = clampInteger(input.limit, 1, 100, 20);
    return reply.send(cliJsonOutput({ projects: projects.listProjects().projects.slice(0, limit) }));
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/get", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(await projects.getProject(projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "project_get_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/create", async (request, reply) => {
    return createProjectCliResponse(reply, projects, readCliInputBody(request.body));
  });

  server.post<{ Body: unknown }>("/tutti/cli/projects/open", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      const { project } = await projects.getProject(projectId);
      return reply.send(cliJsonOutput(await openProjectCliOutput(project)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "project_open_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/deck/get", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(await deckCliOutput(projects, projectId, {
        slideId: optionalString(input, "slide-id"),
        includeHtml: optionalBoolean(input, "include-html") ?? false,
      })));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "deck_get_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/slides/get", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    const slideId = requiredString(input, "slide-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    if (!slideId) return sendCliError(reply, 400, "invalid_input", "slide-id is required");
    try {
      return reply.send(cliJsonOutput(await slideCliOutput(projects, projectId, slideId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "slide_get_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/workspace/get", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(await slideWorkspaceOutput(projects, projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "workspace_get_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/exports/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      const { project, artifact } = await projects.getProject(projectId);
      const workspace = projects.projectWorkspaceContext(project.id, artifact);
      return reply.send(cliJsonOutput({
        project: projectSummary(project),
        artifact,
        workspace,
        exports: await listWorkspaceFiles(workspace.workspaceRoot, "exports"),
      }));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "exports_list_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/sessions/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(projects.listConversationSessions(projectId)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "sessions_list_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/sessions/create", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    try {
      return reply.send(cliJsonOutput(projects.createConversationSession(projectId, { title: optionalString(input, "title") })));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "session_create_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/messages/list", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    const sessionId = requiredString(input, "session-id");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    if (!sessionId) return sendCliError(reply, 400, "invalid_input", "session-id is required");
    try {
      return reply.send(cliJsonOutput(projects.listConversationMessages({ projectId, sessionId })));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "messages_list_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/messages/create", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const projectId = requiredString(input, "project-id");
    const sessionId = requiredString(input, "session-id");
    const role = normalizeMessageRole(input.role);
    const content = requiredString(input, "content");
    if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
    if (!sessionId) return sendCliError(reply, 400, "invalid_input", "session-id is required");
    if (!role) return sendCliError(reply, 400, "invalid_input", "role must be user or assistant");
    if (!content) return sendCliError(reply, 400, "invalid_input", "content is required");
    try {
      return reply.send(cliJsonOutput(projects.createConversationMessage({ projectId, sessionId, role, content })));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "message_create_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/run", async (request, reply) => {
    return agentRunCliResponse(reply, projects, readCliInputBody(request.body));
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/edit", async (request, reply) => {
    return agentRunCliResponse(reply, projects, readCliInputBody(request.body));
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/events", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const runId = requiredString(input, "run-id");
    if (!runId) return sendCliError(reply, 400, "invalid_input", "run-id is required");
    try {
      const result = projects.listRunEvents(runId);
      return reply.send(cliJsonOutput({
        ...result,
        openTarget: result.run?.projectId ? projectOpenTarget(result.run.projectId) : null,
        guidance: finalOpenGuidance("AI Slide"),
      }));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "agent_events_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/agent/cancel", async (request, reply) => {
    const input = readCliInputBody(request.body);
    const runId = requiredString(input, "run-id");
    if (!runId) return sendCliError(reply, 400, "invalid_input", "run-id is required");
    try {
      const result = await projects.cancelRun(runId);
      if (!result) return sendCliError(reply, 404, "run_not_found", "Run not found");
      return reply.send(cliJsonOutput(result));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "agent_cancel_failed", errorMessage(error));
    }
  });

  server.post("/tutti/cli/officecli/install", async (_request, reply) => {
    try {
      return reply.send(cliJsonOutput({ officecli: await installOfficeCli() }));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "officecli_install_failed", errorMessage(error));
    }
  });

  server.post<{ Body: unknown }>("/tutti/cli/open", async (request, reply) => {
    const input = readCliInputBody(request.body);
    if (typeof input.path !== "string" || !input.path.trim()) {
      return sendCliError(reply, 400, "invalid_input", "path is required and must point to a .pptx file");
    }
    try {
      const result = await projects.importPptxProject({
        path: input.path,
        title: typeof input.title === "string" ? input.title : undefined,
      });
      return reply.send(cliJsonOutput(await openSlideCliOutput(projects, result)));
    } catch (error) {
      return sendCliError(reply, cliErrorStatus(error), "open_failed", errorMessage(error));
    }
  });
}

async function deckCliOutput(projects: ProjectService, projectId: string, options: { slideId?: string; includeHtml: boolean }) {
  const detail = await projects.getProject(projectId);
  const workspace = projects.projectWorkspaceContext(detail.project.id, detail.artifact);
  if (detail.artifact.type !== "deck") {
    return {
      project: projectSummary(detail.project),
      artifact: detail.artifact,
      contentMode: "local-file",
      deckManifest: null,
      pptxManifest: detail.pptxManifest,
      workspace,
      guidance: [
        "The active artifact is PPTX, so deck slide HTML is not available.",
        "Inspect the focusedPath with OfficeCLI or another local PPTX-aware tool.",
        modificationGuidance("slide"),
      ],
    };
  }
  const manifestSlides = detail.deckManifest?.slides ?? [];
  const selectedSlides = options.slideId ? manifestSlides.filter((slide) => slide.id === options.slideId) : manifestSlides;
  if (options.slideId && selectedSlides.length === 0) throw new Error("Slide not found");
  return {
    project: projectSummary(detail.project),
    artifact: detail.artifact,
    contentMode: options.includeHtml ? "inline-html" : "paths",
    deckManifest: detail.deckManifest,
    workspace,
    slides: await Promise.all(selectedSlides.map((slide) => slideOutput(projects, projectId, detail.artifact, workspace.workspaceRoot, slide, options.includeHtml))),
    guidance: [
      "Use slide paths for local inspection when inline HTML is not requested.",
      modificationGuidance("slide"),
    ],
  };
}

async function slideCliOutput(projects: ProjectService, projectId: string, slideId: string) {
  const detail = await projects.getProject(projectId);
  const workspace = projects.projectWorkspaceContext(detail.project.id, detail.artifact);
  if (detail.artifact.type !== "deck") throw new Error("The active artifact is not a deck");
  const result = await projects.readDeckSlideHtml(projectId, slideId);
  return {
    project: projectSummary(detail.project),
    artifact: result.artifact,
    workspace,
    slide: {
      ...result.slide,
      path: join(workspace.workspaceRoot, result.artifact.fileRef, result.slide.file),
      html: result.html,
    },
    guidance: modificationGuidance("slide"),
  };
}

async function slideWorkspaceOutput(projects: ProjectService, projectId: string) {
  const detail = await projects.getProject(projectId);
  const workspace = projects.projectWorkspaceContext(detail.project.id, detail.artifact);
  return {
    project: projectSummary(detail.project),
    artifact: detail.artifact,
    deckManifest: detail.deckManifest,
    pptxManifest: detail.pptxManifest,
    workspace,
    assets: await listWorkspaceFiles(workspace.workspaceRoot, "assets"),
    deckAssets: detail.artifact.type === "deck" ? await listWorkspaceFiles(workspace.workspaceRoot, join(detail.artifact.fileRef, "assets")) : [],
    exports: await listWorkspaceFiles(workspace.workspaceRoot, "exports"),
    guidance: [
      "Use focusedPath for local inspection when content is too large, directory-backed, or binary for inline CLI output.",
      modificationGuidance("slide"),
    ],
  };
}

async function slideOutput(
  projects: ProjectService,
  projectId: string,
  artifact: SlideArtifact,
  workspaceRoot: string,
  slide: DeckManifestSlide,
  includeHtml: boolean,
) {
  const output: DeckManifestSlide & { path: string; html?: string } = {
    ...slide,
    path: join(workspaceRoot, artifact.fileRef, slide.file),
  };
  if (includeHtml) {
    output.html = (await projects.readDeckSlideHtml(projectId, slide.id)).html;
  }
  return output;
}

async function createProjectCliResponse(reply: FastifyReply, projects: ProjectService, input: Record<string, unknown>) {
  const artifactType = normalizeArtifactType(input["artifact-type"] ?? input.artifactType);
  if (!artifactType) return sendCliError(reply, 400, "invalid_input", "artifactType must be deck or pptx");
  const prompt = optionalString(input, "prompt");
  const mode = normalizeAiMode(input.mode);
  if (!mode) return sendCliError(reply, 400, "invalid_input", "mode must be write or rewrite");
  const runtimeProfileId = await runtimeProfileIdFromCliInput(input);
  if (runtimeProfileId.error) return sendCliError(reply, 400, "invalid_input", runtimeProfileId.error);
  try {
    const result = await projects.createProject({
      title: typeof input.title === "string" ? input.title : undefined,
      artifactType,
    });
    const run = prompt
      ? (await projects.startAiEdit(result.project.id, {
          userPrompt: prompt,
          mode,
          artifactType,
          selectedText: "",
          selectedHtml: "",
          selectionType: "write",
          selectionPath: "",
          runtimeProfileId: runtimeProfileId.value,
        })).run
      : null;
    return reply.send(cliJsonOutput({
      ok: true,
      project: result.project,
      artifact: result.artifact,
      run,
      openTarget: projectOpenTarget(result.project.id),
      workspace: projects.projectWorkspaceContext(result.project.id, result.artifact),
      guidance: finalOpenGuidance("AI Slide"),
    }));
  } catch (error) {
    return sendCliError(reply, cliErrorStatus(error), "project_create_failed", errorMessage(error));
  }
}

async function agentRunCliResponse(reply: FastifyReply, projects: ProjectService, input: Record<string, unknown>) {
  const projectId = requiredString(input, "project-id");
  const prompt = requiredString(input, "prompt");
  const mode = normalizeAiMode(input.mode);
  if (!projectId) return sendCliError(reply, 400, "invalid_input", "project-id is required");
  if (!prompt) return sendCliError(reply, 400, "invalid_input", "prompt is required");
  if (!mode) return sendCliError(reply, 400, "invalid_input", "mode must be write or rewrite");
  const runtimeProfileId = await runtimeProfileIdFromCliInput(input);
  if (runtimeProfileId.error) return sendCliError(reply, 400, "invalid_input", runtimeProfileId.error);
  try {
    const { artifact } = await projects.getProject(projectId);
    const result = await projects.startAiEdit(projectId, {
      userPrompt: prompt,
      mode,
      artifactType: artifact.type,
      selectedText: "",
      selectedHtml: "",
      selectionType: "write",
      selectionPath: "",
      sessionId: optionalString(input, "session-id"),
      runtimeProfileId: runtimeProfileId.value,
    });
    return reply.send(cliJsonOutput({
      ...result,
      openTarget: projectOpenTarget(projectId),
      guidance: finalOpenGuidance("AI Slide"),
    }));
  } catch (error) {
    return sendCliError(reply, cliErrorStatus(error), "agent_run_failed", errorMessage(error));
  }
}

function sendCliError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send(cliErrorOutput(code, message));
}

function requiredString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function optionalString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function runtimeProfileIdFromCliInput(input: Record<string, unknown>): Promise<{ value?: string; error?: string }> {
  const provider = optionalString(input, "provider");
  if (!provider) {
    const runtimeProfileId = optionalString(input, "runtime-profile-id");
    if (runtimeProfileId) return { value: runtimeProfileId };
    return { value: await defaultRuntimeProfileIdFromTuttiCli() };
  }
  return runtimeProfileIdFromProvider(provider);
}

async function defaultRuntimeProfileIdFromTuttiCli() {
  const provider = await getDefaultAgentProvider().catch(() => undefined);
  return provider ? runtimeProfileIdFromProvider(provider).value : undefined;
}

function optionalBoolean(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function normalizeMessageRole(value: unknown): "user" | "assistant" | null {
  if (value === "user" || value === "assistant") return value;
  return null;
}

function normalizeAiMode(value: unknown): AiEditMode | null {
  if (value === undefined || value === null || value === "") return "write";
  if (value === "write" || value === "rewrite") return value;
  return null;
}

async function openSlideCliOutput(
  projects: ProjectService,
  input: { sourcePath: string; project: SlideProject; artifact: SlideArtifact },
): Promise<OpenSlideCliResponse> {
  return {
    ok: true,
    action: "imported",
    sourcePath: input.sourcePath,
    project: input.project,
    artifact: input.artifact,
    openTarget: projectOpenTarget(input.project.id),
    workspace: projects.projectWorkspaceContext(input.project.id, input.artifact),
  };
}

async function openProjectCliOutput(project: SlideProject) {
  const route = projectRoute(project.id);
  const appOpen = await openTuttiAppRoute(appId(), route);
  if (appOpen.error) {
    throw new Error(appOpen.error);
  }
  return {
    ok: true,
    project: projectSummary(project),
    openRequested: true,
    openTarget: projectOpenTarget(project.id),
    tuttiAppOpen: appOpen,
  };
}

function projectOpenTarget(projectId: string) {
  return {
    kind: "tutti-cli-command" as const,
    appId: appId(),
    directOpenSupported: true as const,
    label: "Open in AI Slide",
    projectId,
    userFacing: false as const,
    command: {
      scope: "slide",
      path: ["projects", "open"],
      input: { "project-id": projectId },
      display: `slide projects open --project-id ${projectId}`,
    },
  };
}

function finalOpenGuidance(appName: string) {
  return `Do not display openTarget internals or any raw app route as a user-facing link. When the task is complete, tell the user they can view the result in ${appName} and ask whether they want you to open it directly. If they confirm, call the returned openTarget command.`;
}

function projectSummary(project: SlideProject) {
  return {
    id: project.id,
    title: project.title,
    template: project.templateName,
    templateName: project.templateName,
    updatedAt: project.updatedAt,
    "updated-at": project.updatedAt,
  };
}

function modificationGuidance(scope: "slide") {
  return `To modify project content through CLI, start an app-owned agent edit with ${scope} agent edit. Do not write raw content updates through external CLI commands.`;
}

async function listWorkspaceFiles(workspaceRoot: string, relativeDir: string) {
  const root = join(workspaceRoot, relativeDir);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(entries
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const absolutePath = join(root, entry.name);
      const info = await stat(absolutePath).catch(() => null);
      return {
        fileName: entry.name,
        path: absolutePath,
        relativePath: `${relativeDir}/${entry.name}`.split("\\").join("/"),
        sizeBytes: info?.size ?? null,
        mtimeMs: info ? Math.trunc(info.mtimeMs) : null,
        mimeType: mimeTypeForFileName(entry.name),
      };
    }));
  return files.sort((left, right) => String(left.fileName).localeCompare(String(right.fileName)));
}

function mimeTypeForFileName(fileName: string) {
  const extension = extname(fileName).slice(1).toLowerCase();
  if (extension === "html" || extension === "htm") return "text/html";
  if (extension === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (extension === "pdf") return "application/pdf";
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function projectRoute(projectId: string) {
  return `/slide/${encodeURIComponent(projectId)}`;
}

function appId() {
  return process.env.TUTTI_APP_ID?.trim() || "ai-slide";
}

function cliErrorStatus(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  if (message.includes("tutti_cli")) return 503;
  if (message.includes("officecli")) return 503;
  if (message.includes("no such file") || message.includes("enoent")) return 404;
  return 400;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unable to open presentation");
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeArtifactType(value: unknown): SlideArtifactType | undefined {
  if (value === undefined || value === null || value === "") return "deck";
  if (value === "deck" || value === "pptx") return value;
  return undefined;
}
