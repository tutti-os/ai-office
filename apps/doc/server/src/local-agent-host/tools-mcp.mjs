#!/usr/bin/env node
import { createInterface } from "node:readline";

const baseUrl = process.env.AI_DOC_TOOL_BASE_URL ?? "http://127.0.0.1:8790";
const projectId = requiredEnv("AI_DOC_PROJECT_ID");
const token = requiredEnv("AI_DOC_TOOL_TOKEN");

const tools = [
  {
    name: "ai_document_get_document",
    description: "Read the current rich HTML document project, including title, type, and canonical HTML content.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "ai_document_save_document",
    description: "Save a full updated HTML document as the canonical project content. Use this when you have produced a complete edited HTML document.",
    inputSchema: {
      type: "object",
      properties: {
        htmlContent: { type: "string" },
        title: { type: "string" },
      },
      required: ["htmlContent"],
      additionalProperties: false,
    },
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
      serverInfo: { name: "ai-doc-tools", version: "0.1.0" },
      capabilities: { tools: {} },
    };
  }
  if (method === "tools/list") return { tools };
  if (method === "tools/call") return callTool(String(params.name ?? ""), params.arguments ?? {});
  if (method === "ping") return {};
  throw new Error(`Unsupported MCP method: ${method}`);
}

async function callTool(name, args) {
  if (name === "ai_document_get_document") {
    return toolResult(await requestJson("GET", toolUrl("document")));
  }
  if (name === "ai_document_save_document") {
    return toolResult(
      await requestJson("POST", toolUrl("document"), {
        htmlContent: requiredString(args.htmlContent, "htmlContent"),
        title: typeof args.title === "string" ? args.title : undefined,
      }),
    );
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function requestJson(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-ai-doc-tool-token": token,
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
  if (!response.ok) throw new Error(`ai-doc tool gateway ${response.status}: ${JSON.stringify(data)}`);
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
