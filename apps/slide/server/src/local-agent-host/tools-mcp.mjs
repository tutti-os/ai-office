#!/usr/bin/env node
import { createInterface } from "node:readline";

const baseUrl = process.env.AI_SLIDE_TOOL_BASE_URL ?? "http://127.0.0.1:8791";
const projectId = requiredEnv("AI_SLIDE_PROJECT_ID");
const token = requiredEnv("AI_SLIDE_TOOL_TOKEN");

const tools = [
  {
    name: "ai_slide_get_project",
    description: "Read the current slide project, active artifact, and available deck/PPTX manifest metadata.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ai_slide_get_deck_manifest",
    description: "Read deck.slides/manifest.json for the current editable HTML deck.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "ai_slide_get_slide_html",
    description: "Read a single slide HTML file by slide id from the current editable HTML deck.",
    inputSchema: {
      type: "object",
      properties: {
        slideId: { type: "string" },
      },
      required: ["slideId"],
      additionalProperties: false,
    },
  },
  {
    name: "ai_slide_save_slide_html",
    description: "Save a full updated HTML document for one slide in the current editable HTML deck.",
    inputSchema: {
      type: "object",
      properties: {
        slideId: { type: "string" },
        html: { type: "string" },
      },
      required: ["slideId", "html"],
      additionalProperties: false,
    },
  },
  {
    name: "ai_slide_get_pptx_manifest",
    description: "Read the current PPTX file manifest metadata for slides.pptx.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (request.id === undefined || typeof request.method !== "string") return;
  try {
    const result = await handleRequest(request.method, request.params ?? {});
    write({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    write({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
});

async function handleRequest(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: params.protocolVersion ?? "2024-11-05",
      serverInfo: { name: "ai-slide-tools", version: "0.1.0" },
      capabilities: { tools: {} },
    };
  }
  if (method === "tools/list") return { tools };
  if (method === "tools/call") return callTool(String(params.name ?? ""), params.arguments ?? {});
  if (method === "ping") return {};
  throw new Error(`Unsupported MCP method: ${method}`);
}

async function callTool(name, args) {
  if (name === "ai_slide_get_project") return toolResult(await requestJson("GET", toolUrl("project")));
  if (name === "ai_slide_get_deck_manifest") return toolResult(await requestJson("GET", toolUrl("deck/manifest")));
  if (name === "ai_slide_get_slide_html") {
    return toolResult(await requestJson("GET", toolUrl(`deck/slides/${encodeURIComponent(requiredString(args.slideId, "slideId"))}`)));
  }
  if (name === "ai_slide_save_slide_html") {
    return toolResult(
      await requestJson("POST", toolUrl(`deck/slides/${encodeURIComponent(requiredString(args.slideId, "slideId"))}`), {
        html: requiredString(args.html, "html"),
      }),
    );
  }
  if (name === "ai_slide_get_pptx_manifest") return toolResult(await requestJson("GET", toolUrl("pptx/manifest")));
  throw new Error(`Unknown tool: ${name}`);
}

async function requestJson(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-ai-slide-tool-token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { text };
  }
  if (!response.ok) throw new Error(`ai-slide tool gateway ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function toolUrl(route) {
  return `${baseUrl}/api/agent-tools/projects/${encodeURIComponent(projectId)}/${route}`;
}

function toolResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function requiredString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
