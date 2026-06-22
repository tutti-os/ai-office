type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const gatewayUrl = process.env.AI_APP_TOOL_GATEWAY_URL ?? "";
const gatewayToken = process.env.AI_APP_TOOL_TOKEN ?? "";

if (!gatewayUrl || !gatewayToken) {
  process.stderr.write("AI app tool MCP server requires AI_APP_TOOL_GATEWAY_URL and AI_APP_TOOL_TOKEN.\n");
  process.exit(1);
}

let inputBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
let outputFraming: "content-length" | "jsonl" | null = null;

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, typeof chunk === "string" ? Buffer.from(chunk) : chunk]);
  void drainMessages();
});

async function drainMessages() {
  while (true) {
    const parsed = readMessage(inputBuffer);
    if (!parsed) return;
    inputBuffer = parsed.rest;
    outputFraming = parsed.framing;
    await handleMessage(parsed.message).catch((error) => {
      const id = isRecord(parsed.message) ? (parsed.message.id as string | number | null | undefined) : null;
      if (id !== undefined) writeJsonRpc({ jsonrpc: "2.0", id, error: { code: -32603, message: errorMessage(error) } });
    });
  }
}

async function handleMessage(message: unknown) {
  if (!isRecord(message)) return;
  const request = message as JsonRpcRequest;
  if (!request.method) return;
  if (request.method.startsWith("notifications/")) return;
  const id = request.id ?? null;

  if (request.method === "initialize") {
    const params = recordInput(request.params);
    const protocolVersion = typeof params.protocolVersion === "string" && params.protocolVersion ? params.protocolVersion : "2025-03-26";
    writeJsonRpc({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "ai-app-tools", version: "0.1.0" },
      },
    });
    return;
  }

  if (request.method === "ping") {
    writeJsonRpc({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  if (request.method === "tools/list") {
    writeJsonRpc({ jsonrpc: "2.0", id, result: { tools: await listTools() } });
    return;
  }

  if (request.method === "tools/call") {
    const params = recordInput(request.params);
    const name = typeof params.name === "string" ? params.name : "";
    const args = params.arguments ?? {};
    const result = await callTool(name, args);
    writeJsonRpc({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      },
    });
    return;
  }

  writeJsonRpc({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${request.method}` } });
}

async function listTools(): Promise<McpTool[]> {
  const response = await fetchJson(`${gatewayUrl.replace(/\/$/, "")}/list`, { method: "GET" });
  const tools = Array.isArray(response.tools) ? response.tools : [];
  return tools.map((tool) => ({
    name: String(tool.name ?? ""),
    description: String(tool.description ?? ""),
    inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : { type: "object" },
  }));
}

async function callTool(name: string, input: unknown) {
  const response = await fetchJson(`${gatewayUrl.replace(/\/$/, "")}/call`, {
    method: "POST",
    body: JSON.stringify({ name, input }),
    headers: { "content-type": "application/json" },
  });
  return response.result ?? response;
}

async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${gatewayToken}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(String(parsed.error ?? response.statusText));
  return parsed as Record<string, unknown>;
}

function readMessage(buffer: Buffer<ArrayBufferLike>): { message: unknown; rest: Buffer<ArrayBufferLike>; framing: "content-length" | "jsonl" } | null {
  const jsonl = readJsonLineMessage(buffer);
  if (jsonl) return jsonl;

  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd < 0) return null;
  const header = buffer.subarray(0, headerEnd).toString("utf8");
  const lengthMatch = header.match(/content-length:\s*(\d+)/i);
  if (!lengthMatch?.[1]) throw new Error("Missing Content-Length header");
  const length = Number(lengthMatch[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + length;
  if (buffer.length < bodyEnd) return null;
  const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
  return { message: JSON.parse(body), rest: buffer.subarray(bodyEnd), framing: "content-length" };
}

function readJsonLineMessage(buffer: Buffer<ArrayBufferLike>): { message: unknown; rest: Buffer<ArrayBufferLike>; framing: "jsonl" } | null {
  const firstNonWhitespace = buffer.findIndex((byte) => !isAsciiWhitespace(byte));
  if (firstNonWhitespace < 0) return null;
  const firstByte = buffer[firstNonWhitespace];
  if (firstByte !== 123 && firstByte !== 91) return null;
  const newlineIndex = buffer.indexOf("\n", firstNonWhitespace);
  if (newlineIndex < 0) return null;
  const line = buffer.subarray(firstNonWhitespace, newlineIndex).toString("utf8").trim();
  if (!line) return { message: undefined, rest: buffer.subarray(newlineIndex + 1), framing: "jsonl" };
  return { message: JSON.parse(line), rest: buffer.subarray(newlineIndex + 1), framing: "jsonl" };
}

function writeJsonRpc(value: unknown) {
  const body = JSON.stringify(value);
  if (outputFraming === "jsonl") {
    process.stdout.write(`${body}\n`);
    return;
  }
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

function recordInput(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAsciiWhitespace(byte: number) {
  return byte === 9 || byte === 10 || byte === 13 || byte === 32;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "MCP app tool failed";
}
