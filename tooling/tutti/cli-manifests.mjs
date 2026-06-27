import { createCliManifest, renderCommandsGuide } from "@ai-app/tutti-packager";

export const artifactCliConfigs = {
  doc: {
    scope: "doc",
    description: "Open, create, and inspect AI Doc projects.",
    documentationFile: "COMMANDS.md",
    guideTitle: "AI Doc CLI Commands",
    guideIntro: "These commands expose AI Doc to Tutti apps and agents.",
    commands: [
      statusCommand("AI Doc"),
      projectsListCommand("document"),
      projectsGetCommand("document"),
      projectOpenCommand("document", "AI Doc"),
      {
        path: ["projects", "create"],
        summary: "Create a document project",
        description:
          "Create a new AI Doc project, return an internal openTarget command, and optionally start the app's agent with prompt. This command must not open the app automatically. Use prompt for generated document content; direct content input is not supported. For user requests to write a document, draft, article, report, or manuscript without an explicit file format, set type to html. If the user explicitly asks for DOCX or traditional Office Word format, set type to docx. Use markdown only when the user explicitly asks for Markdown. Do not present localhost URLs or raw routes as final links. When the task is complete, tell the user they can view the result in AI Doc and ask whether they want you to open it directly; if they confirm, call doc projects open with the project-id.",
        properties: docCreateProperties(),
      },
      {
        path: ["content", "get"],
        summary: "Get document content",
        description:
          "Return one document project's current content and local workspace context. HTML and Markdown projects return inline content. DOCX projects return the focused local file path and manifest instead of inline document text. The response also includes focused paths, assets, exports, and guidance. To modify project content through CLI, start an app-owned agent edit.",
        properties: projectIdProperties("Document project id to inspect."),
        required: ["project-id"],
      },
      exportsListCommand("document"),
      ...conversationCommands("document"),
      ...agentCommands("document", { scope: "doc", appName: "AI Doc", contentModificationPath: true }),
      officeCliInstallCommand("DOCX"),
      {
        path: ["open"],
        summary: "Import a document file",
        description:
          "Import an HTML, Markdown, or DOCX file into AI Doc and return workspace paths plus an internal openTarget command for the imported project. This command must not open the app automatically. Do not present localhost URLs or raw routes as final links. Ask whether the user wants you to open the project directly; if they confirm, call doc projects open with the project-id.",
        properties: pathAndTitleProperties(
          "Absolute path, home-relative path, or path relative to the Tutti workspace root.",
        ),
        required: ["path"],
      },
    ],
  },
  slide: {
    scope: "slide",
    description: "Open, create, and inspect AI Slide projects.",
    documentationFile: "COMMANDS.md",
    guideTitle: "AI Slide CLI Commands",
    guideIntro: "These commands expose AI Slide to Tutti apps and agents.",
    commands: [
      statusCommand("AI Slide"),
      projectsListCommand("slide"),
      projectsGetCommand("slide"),
      projectOpenCommand("slide", "AI Slide"),
      {
        path: ["projects", "create"],
        summary: "Create a slide project",
        description:
          "Create a new AI Slide project, return an internal openTarget command, and optionally start app-owned async editing with prompt. This command must not open the app automatically. For user requests to make a PPT, slides, slide deck, or presentation without an explicit traditional Office file format, set artifact-type to deck. If the user explicitly asks for PPTX or traditional Office PowerPoint format, set artifact-type to pptx. Do not present localhost URLs or raw routes as final links. When the task is complete, tell the user they can view the result in AI Slide and ask whether they want you to open it directly; if they confirm, call slide projects open with the project-id. When a prompt starts app-owned editing, treat the returned run-id as the only writer for that project until it reaches a terminal status. Poll slide agent events by run-id until run.status is completed, failed, or cancelled; accepted/running means the app is still working. Do not inspect deck.slides and write fallback slide files while app-owned editing is accepted or running. If it is still running after several polls, report that generation is still in progress instead of creating content yourself.",
        properties: slideCreateProperties(),
      },
      {
        path: ["deck", "get"],
        summary: "Get deck structure",
        description:
          "Return the active deck manifest, slide ids, and local slide HTML paths. Pass slide-id to narrow to one slide, and include-html true to include slide HTML inline. PPTX artifacts return focused file metadata and guidance instead of deck HTML. To modify project content through CLI, start an app-owned edit with slide agent edit.",
        properties: {
          ...projectIdProperties("Slide project id to inspect."),
          "slide-id": { type: "string", description: "Optional slide id to inspect." },
          "include-html": { type: "boolean", description: "When true, include slide HTML inline in the response." },
        },
        required: ["project-id"],
      },
      {
        path: ["slides", "get"],
        summary: "Get one slide",
        description:
          "Return one deck slide's HTML, metadata, and local path by slide-id. This is a read-only command. To modify project content through CLI, start an app-owned edit with slide agent edit.",
        properties: {
          ...projectIdProperties("Slide project id to inspect."),
          "slide-id": { type: "string", description: "Slide id to read." },
        },
        required: ["project-id", "slide-id"],
      },
      workspaceGetCommand("slide", "AI Slide"),
      exportsListCommand("slide"),
      ...conversationCommands("slide"),
      ...agentCommands("slide", { scope: "slide", appName: "AI Slide", contentModificationPath: true }),
      officeCliInstallCommand("PPTX"),
      {
        path: ["open"],
        summary: "Import a presentation file",
        description:
          "Import a PPTX file into AI Slide and return workspace paths plus an internal openTarget command for the imported project. This command must not open the app automatically. Do not present localhost URLs or raw routes as final links. Ask whether the user wants you to open the project directly; if they confirm, call slide projects open with the project-id.",
        properties: pathAndTitleProperties(
          "Absolute path, home-relative path, or path relative to the Tutti workspace root.",
        ),
        required: ["path"],
      },
    ],
  },
  sheet: {
    scope: "sheet",
    description: "Open, import, and inspect AI Sheet workbook projects.",
    documentationFile: "COMMANDS.md",
    guideTitle: "AI Sheet CLI Commands",
    guideIntro: "These commands expose AI Sheet to Tutti apps and agents.",
    commands: [
      statusCommand("AI Sheet"),
      projectsListCommand("workbook"),
      projectsGetCommand("workbook"),
      {
        path: ["projects", "create"],
        summary: "Create a workbook project",
        description:
          "Create a new AI Sheet workbook project directly, including a blank workbook.xlsx in the project workspace. When prompt is provided, the app creates the project and starts an agent run to initialize or edit the workbook.",
        properties: sheetCreateProperties(),
      },
      ...conversationCommands("workbook"),
      ...agentCommands("workbook"),
      officeCliInstallCommand("XLSX"),
      {
        path: ["open"],
        summary: "Open a workbook file",
        description:
          "Import an XLSX file into AI Sheet, request opening its app route through Tutti CLI, and return workspace paths for agent editing.",
        properties: pathAndTitleProperties(
          "Absolute path, home-relative path, or path relative to the Tutti workspace root.",
        ),
        required: ["path"],
      },
    ],
  },
};

export function createArtifactCliManifest(app) {
  return createCliManifest(cliConfig(app));
}

export function renderArtifactCommandsGuide(app) {
  return renderCommandsGuide(cliConfig(app));
}

function cliConfig(app) {
  const config = artifactCliConfigs[app];
  if (!config) throw new Error(`Unknown artifact app CLI config: ${app}`);
  return config;
}

function statusCommand(appName) {
  return {
    path: ["status"],
    summary: `Show ${appName} status`,
    description: `Return app health, project counts, runtime provider counts, and Tutti CLI availability for ${appName}.`,
    timeoutMs: 10000,
  };
}

function projectsListCommand(domain) {
  return {
    path: ["projects", "list"],
    summary: `List ${domain} projects`,
    description: `List recent ${domain} projects as JSON for agents and other Tutti apps.`,
    properties: {
      limit: { type: "integer", description: "Maximum number of projects to return." },
    },
  };
}

function projectsGetCommand(domain) {
  return {
    path: ["projects", "get"],
    summary: `Get a ${domain} project`,
    description: `Return one ${domain} project by project-id.`,
    properties: {
      "project-id": { type: "string", description: "Project id to load." },
    },
    required: ["project-id"],
  };
}

function projectOpenCommand(domain, appName) {
  return {
    path: ["projects", "open"],
    summary: `Open a ${domain} project`,
    description: `Explicitly request Tutti to open one ${domain} project in ${appName}. Use this only after the user confirms they want you to open the app directly; create, import, and agent-edit commands must not call it automatically.`,
    properties: {
      "project-id": { type: "string", description: `${domain[0].toUpperCase()}${domain.slice(1)} project id to open.` },
    },
    required: ["project-id"],
    timeoutMs: 10000,
  };
}

function projectIdProperties(description = "Project id.") {
  return {
    "project-id": { type: "string", description },
  };
}

function workspaceGetCommand(domain, appName) {
  return {
    path: ["workspace", "get"],
    summary: `Get ${domain} workspace`,
    description: `Return local workspace paths, focused artifact paths, assets, exports, and guidance for one ${domain} project in ${appName}. Local paths are for inspection; content modifications through CLI must trigger the app-owned agent run.`,
    properties: projectIdProperties(`${domain[0].toUpperCase()}${domain.slice(1)} project id to inspect.`),
    required: ["project-id"],
  };
}

function exportsListCommand(domain) {
  return {
    path: ["exports", "list"],
    summary: `List ${domain} exports`,
    description: `List files already exported from one ${domain} project, including local paths, MIME types, sizes, and modification times.`,
    properties: projectIdProperties(`${domain[0].toUpperCase()}${domain.slice(1)} project id whose exports should be listed.`),
    required: ["project-id"],
  };
}

function docCreateProperties() {
  return {
    title: { type: "string", description: "Project title." },
    type: {
      type: "string",
      description:
        "Document type: html, markdown, or docx. Default intent mapping: document/draft/article/report/manuscript => html; explicit DOCX or traditional Office Word => docx; explicit Markdown => markdown.",
    },
    prompt: { type: "string", description: "Optional prompt for the AI Doc app agent to generate or edit the document after project creation." },
    provider: { type: "string", description: "Optional app-agent provider for prompt-based creation: codex or claude-code." },
  };
}

function slideCreateProperties() {
  return {
    title: { type: "string", description: "Project title." },
    "artifact-type": {
      type: "string",
      description:
        "Artifact type: deck or pptx. Default intent mapping: PPT/slides/slide deck/presentation => deck; explicit PPTX or traditional Office PowerPoint => pptx.",
    },
    prompt: {
      type: "string",
      description:
        "Optional prompt for the AI Slide app agent to generate or edit the deck after project creation. If supplied, poll the returned run with slide agent events and do not write fallback deck files while the run is accepted or running.",
    },
    provider: { type: "string", description: "Optional app-agent provider for prompt-based creation: codex or claude-code." },
  };
}

function sheetCreateProperties() {
  return {
    title: { type: "string", description: "Project title." },
    prompt: { type: "string", description: "Optional prompt for an agent run after project creation." },
    "runtime-profile-id": { type: "string", description: "Optional runtime profile id for prompt-based initialization." },
  };
}

function pathAndTitleProperties(pathDescription) {
  return {
    path: { type: "string", description: pathDescription },
    title: { type: "string", description: "Optional project title override." },
  };
}

function conversationCommands(domain) {
  return [
    {
      path: ["sessions", "list"],
      summary: "List conversation sessions",
      description: `List agent conversation sessions for a ${domain} project.`,
      properties: {
        "project-id": { type: "string", description: "Project id whose sessions should be listed." },
      },
      required: ["project-id"],
    },
    {
      path: ["sessions", "create"],
      summary: "Create a conversation session",
      description: `Create a new agent conversation session for a ${domain} project.`,
      properties: {
        "project-id": { type: "string", description: "Project id for the new session." },
        title: { type: "string", description: "Optional session title." },
      },
      required: ["project-id"],
    },
    {
      path: ["messages", "list"],
      summary: "List conversation messages",
      description: "List messages in one agent conversation session.",
      properties: {
        "project-id": { type: "string", description: "Project id that owns the session." },
        "session-id": { type: "string", description: "Conversation session id." },
      },
      required: ["project-id", "session-id"],
    },
    {
      path: ["messages", "create"],
      summary: "Create a conversation message",
      description: "Append a text-only user or assistant message to one conversation session.",
      properties: {
        "project-id": { type: "string", description: "Project id that owns the session." },
        "session-id": { type: "string", description: "Conversation session id." },
        role: { type: "string", description: "Message role: user or assistant." },
        content: { type: "string", description: "Message text content." },
      },
      required: ["project-id", "session-id", "role", "content"],
    },
  ];
}

function agentCommands(domain, options = {}) {
  const isSlide = domain === "slide";
  const appName = options.appName ?? "the app";
  const commands = [];
  if (!options.contentModificationPath) {
    commands.push({
      path: ["agent", "run"],
      summary: "Start an agent run",
      description: agentRunDescription(domain, options),
      properties: agentEditProperties("User prompt for the agent.", { includeRuntimeProfileId: true }),
      required: ["project-id", "prompt"],
      timeoutMs: 60000,
    });
  }
  if (options.contentModificationPath) {
    commands.push({
      path: ["agent", "edit"],
      summary: "Ask the app agent to edit content",
      description: isSlide
        ? "Start an app-owned async agent edit for a slide project and return an internal openTarget command. External agents and other Tutti apps must use this command to modify slide content, then poll slide agent events until run.status is completed, failed, or cancelled. This command must not open the app automatically. After completion, tell the user they can view the result in AI Slide and ask whether they want you to open it directly; if they confirm, call slide projects open."
        : `Start an app-owned agent edit for a ${domain} project and return an internal openTarget command. External agents and other Tutti apps must use this command to modify ${domain} content, then poll agent events until the run reaches a terminal status. This command must not open the app automatically. After completion, tell the user they can view the result in ${appName} and ask whether they want you to open it directly; if they confirm, call ${options.scope} projects open.`,
      properties: agentEditProperties("User prompt for the app-owned agent.", { includeProvider: true }),
      required: ["project-id", "prompt"],
      timeoutMs: 60000,
    });
  }
  const eventDescription = options.contentModificationPath
    ? (isSlide
        ? "Return one agent run, its persisted events, and the internal project openTarget command by run-id. Use run.status as the source of truth: accepted/running are in-progress states, completed is success, and failed/cancelled are terminal failures. Empty event lists or reconnect/request-timeout status events are not failures by themselves. While a run is accepted or running, callers must not mutate the project workspace as a fallback writer. When run.status is completed, ask whether the user wants you to open the project directly; if they confirm, call slide projects open."
        : `Return one agent run, its persisted events, and the internal project openTarget command by run-id. When the run reaches completed, ask whether the user wants you to open the project directly; if they confirm, call ${options.scope} projects open.`)
    : (isSlide
        ? "Return one agent run and its persisted events by run-id. Use run.status as the source of truth: accepted/running are in-progress states, completed is success, and failed/cancelled are terminal failures. Empty event lists or reconnect/request-timeout status events are not failures by themselves. While a run is accepted or running, callers must not mutate the project workspace as a fallback writer."
        : "Return one agent run and its persisted events by run-id.");
  commands.push(
    {
      path: ["agent", "events"],
      summary: "Poll agent events",
      description: eventDescription,
      properties: {
        "run-id": { type: "string", description: "Agent run id." },
      },
      required: ["run-id"],
    },
    {
      path: ["agent", "cancel"],
      summary: "Cancel an agent run",
      description: "Cancel an active agent run by run-id.",
      properties: {
        "run-id": { type: "string", description: "Agent run id." },
      },
      required: ["run-id"],
    },
  );
  return commands;
}

function agentEditProperties(promptDescription, options = {}) {
  const properties = {
    "project-id": { type: "string", description: "Project id to edit." },
    prompt: { type: "string", description: promptDescription },
    "session-id": { type: "string", description: "Optional conversation session id." },
    mode: { type: "string", description: "Optional edit mode: write or rewrite." },
  };
  if (options.includeProvider) {
    properties.provider = { type: "string", description: "Optional app-agent provider: codex or claude-code." };
  }
  if (options.includeRuntimeProfileId) {
    properties["runtime-profile-id"] = { type: "string", description: "Optional runtime profile id." };
  }
  return properties;
}

function agentRunDescription(domain, options) {
  const isSlide = domain === "slide";
  if (!options.contentModificationPath) {
    return isSlide
      ? "Start an app-owned async agent run for a slide project. Pass session-id to attach messages to an existing session; otherwise the project default session is used. Poll events with slide agent events until run.status is completed, failed, or cancelled. accepted/running means the app is still working, including when events are temporarily empty or contain reconnect/request-timeout status messages. Do not inspect deck.slides and write fallback slide files while this run is accepted or running; report that generation is still in progress if it has not reached a terminal status."
      : `Start an agent run for a ${domain} project. Pass session-id to attach messages to an existing session; otherwise the project default session is used. Poll events with agent events.`;
  }
  return isSlide
    ? "Start an app-owned async agent run for a slide project. This is the CLI modification path for slide content; external agents and other Tutti apps must use this instead of writing raw deck or PPTX updates through CLI. Pass session-id to attach messages to an existing session; otherwise the project default session is used. Poll events with slide agent events until run.status is completed, failed, or cancelled. accepted/running means the app is still working, including when events are temporarily empty or contain reconnect/request-timeout status messages. Do not inspect deck.slides and write fallback slide files while this run is accepted or running; report that generation is still in progress if it has not reached a terminal status."
    : `Start an app-owned agent run for a ${domain} project. This is the CLI modification path for ${domain} content; external agents and other Tutti apps must use this instead of writing raw content updates through CLI. Pass session-id to attach messages to an existing session; otherwise the project default session is used. Poll events with agent events until the run reaches a terminal status.`;
}

function officeCliInstallCommand(domainFormat) {
  return {
    path: ["officecli", "install"],
    summary: "Install OfficeCLI",
    description: `Install or repair the managed OfficeCLI toolchain used for ${domainFormat} import, export, and agent editing.`,
    timeoutMs: 120000,
  };
}
