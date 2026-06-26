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
      {
        path: ["projects", "create"],
        summary: "Create a document project",
        description:
          "Create a new AI Doc project directly. Use type html, markdown, or docx; html is used when type is omitted. When prompt is provided, the app creates the project and starts an agent run to initialize or edit the document.",
        properties: docCreateProperties(),
      },
      ...conversationCommands("document"),
      ...agentCommands("document"),
      officeCliInstallCommand("DOCX"),
      {
        path: ["open"],
        summary: "Open a document file",
        description:
          "Import an HTML, Markdown, or DOCX file into AI Doc, request opening its app route through Tutti CLI, and return workspace paths for agent editing.",
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
      {
        path: ["projects", "create"],
        summary: "Create a slide project",
        description:
          "Create a new AI Slide project directly. Use artifact-type deck or pptx; deck is used when artifact-type is omitted. When prompt is provided, the app creates the project and starts an agent run to initialize or edit the deck.",
        properties: slideCreateProperties(),
      },
      ...conversationCommands("slide"),
      ...agentCommands("slide"),
      officeCliInstallCommand("PPTX"),
      {
        path: ["open"],
        summary: "Open a presentation file",
        description:
          "Import a PPTX file into AI Slide, request opening its app route through Tutti CLI, and return workspace paths for agent editing.",
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

function docCreateProperties() {
  return {
    title: { type: "string", description: "Project title." },
    type: { type: "string", description: "Document type: html, markdown, or docx." },
    content: { type: "string", description: "Initial document content." },
    prompt: { type: "string", description: "Optional prompt for an agent run after project creation." },
    "runtime-profile-id": { type: "string", description: "Optional runtime profile id for prompt-based initialization." },
  };
}

function slideCreateProperties() {
  return {
    title: { type: "string", description: "Project title." },
    "artifact-type": { type: "string", description: "Artifact type: deck or pptx." },
    prompt: { type: "string", description: "Optional prompt for an agent run after project creation." },
    "runtime-profile-id": { type: "string", description: "Optional runtime profile id for prompt-based initialization." },
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

function agentCommands(domain) {
  return [
    {
      path: ["agent", "run"],
      summary: "Start an agent run",
      description: `Start an agent run for a ${domain} project. Pass session-id to attach messages to an existing session; otherwise the project default session is used. Poll events with agent events.`,
      properties: {
        "project-id": { type: "string", description: "Project id to edit." },
        prompt: { type: "string", description: "User prompt for the agent." },
        "session-id": { type: "string", description: "Optional conversation session id." },
        mode: { type: "string", description: "Optional edit mode: write or rewrite." },
        "runtime-profile-id": { type: "string", description: "Optional runtime profile id." },
      },
      required: ["project-id", "prompt"],
      timeoutMs: 60000,
    },
    {
      path: ["agent", "events"],
      summary: "Poll agent events",
      description: "Return one agent run and its persisted events by run-id.",
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
  ];
}

function officeCliInstallCommand(domainFormat) {
  return {
    path: ["officecli", "install"],
    summary: "Install OfficeCLI",
    description: `Install or repair the managed OfficeCLI toolchain used for ${domainFormat} import, export, and agent editing.`,
    timeoutMs: 120000,
  };
}
