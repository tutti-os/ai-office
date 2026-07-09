import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const acpClientPath = path.join(
  rootDir,
  "packages/agent-acp-kit/node_modules/@tutti-os/agent-acp-kit-base/dist/transports/acp/acp-client.js",
);
const acpPermissionsPath = path.join(
  rootDir,
  "packages/agent-acp-kit/node_modules/@tutti-os/agent-acp-kit-base/dist/transports/acp/acp-permissions.js",
);

const acpSessionPath = path.join(
  rootDir,
  "packages/agent-acp-kit/node_modules/@tutti-os/agent-acp-kit-base/dist/transports/acp/acp-session.js",
);

let source = readFileSync(acpClientPath, "utf8");
let sessionSource = readFileSync(acpSessionPath, "utf8");
let permissionsSource = readFileSync(acpPermissionsPath, "utf8");
let changed = false;
let sessionChanged = false;
let permissionsChanged = false;

function patchFile(label, legacy, patched, alreadyMarker, target = "client") {
  const buckets = {
    client: source,
    session: sessionSource,
    permissions: permissionsSource,
  };
  const bucket = buckets[target];
  if (alreadyMarker && bucket.includes(alreadyMarker)) {
    console.log(`[patch-agent-acp-kit-base] skip ${label} (already applied)`);
    return;
  }
  if (!bucket.includes(legacy)) {
    throw new Error(`[patch-agent-acp-kit-base] ${label} target not found`);
  }
  const next = bucket.replace(legacy, patched);
  if (target === "permissions") {
    permissionsSource = next;
    permissionsChanged = true;
  } else if (target === "session") {
    sessionSource = next;
    sessionChanged = true;
  } else {
    source = next;
    changed = true;
  }
  console.log(`[patch-agent-acp-kit-base] ${label}`);
}

patchFile(
  "session/set_model modelId",
  "                model: params.model,",
  "                modelId: params.model,",
  "modelId: params.model",
);

patchFile(
  "cursor session/update parsing",
  `    const kind = String(update.type ?? update.kind ?? update.status ?? "");
    const text = typeof update.text === "string"
        ? update.text
        : typeof update.delta === "string"
            ? update.delta
            : typeof update.content === "string"
                ? update.content
                : undefined;`,
  `    const kind = String(update.sessionUpdate ?? update.type ?? update.kind ?? update.status ?? "");
    const content = update.content;
    const text = typeof update.text === "string"
        ? update.text
        : typeof update.delta === "string"
            ? update.delta
            : typeof update.content === "string"
                ? update.content
                : content && typeof content === "object" && typeof content.text === "string"
                    ? content.text
                    : undefined;`,
  "update.sessionUpdate",
);

patchFile(
  "session/prompt content blocks",
  `        await sendRequest("session/prompt", {
            ...(sessionId ? { sessionId } : {}),
            prompt: params.prompt,
        });`,
  `        const promptContent = typeof params.prompt === "string"
            ? [{ type: "text", text: params.prompt }]
            : params.prompt;
        await sendRequest("session/prompt", {
            ...(sessionId ? { sessionId } : {}),
            prompt: promptContent,
        });`,
  "const promptContent = typeof params.prompt === \"string\"",
);

patchFile(
  "session/request_permission response shape",
  `        if (message.method === "session/request_permission") {
            const params = (message.params ?? {});
            if (message.id !== undefined) {
                sendJsonRpc(processHandle.child.stdin, {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        outcome: choosePermissionOutcome(params.options ?? []),
                    },
                });
            }
            return;
        }`,
  `        if (message.method === "session/request_permission") {
            const params = (message.params ?? {});
            if (message.id !== undefined) {
                const options = Array.isArray(params.options) ? params.options : [];
                const selectedOptionId = choosePermissionOutcome(options)
                    ?? options.find((option) => option?.kind === "allow_once")?.optionId
                    ?? options.find((option) => option?.kind === "allow_always")?.optionId
                    ?? options.find((option) => typeof option?.optionId === "string")?.optionId
                    ?? (typeof options[0]?.optionId === "string" ? options[0].optionId : undefined);
                console.error("[ai-slide-acp-debug] " + JSON.stringify({
                    stage: "session/request_permission",
                    selectedOptionId: selectedOptionId ?? null,
                    optionCount: options.length,
                }));
                sendJsonRpc(processHandle.child.stdin, {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: selectedOptionId
                        ? {
                            outcome: {
                                outcome: "selected",
                                optionId: selectedOptionId,
                            },
                        }
                        : {
                            outcome: {
                                outcome: "cancelled",
                            },
                        },
                });
            }
            return;
        }`,
  'outcome: "selected"',
);

patchFile(
  "permission debug logging",
  `                const selectedOptionId = choosePermissionOutcome(options)
                    ?? options.find((option) => option?.kind === "allow_once")?.optionId
                    ?? options.find((option) => option?.kind === "allow_always")?.optionId
                    ?? options.find((option) => typeof option?.optionId === "string")?.optionId
                    ?? (typeof options[0]?.optionId === "string" ? options[0].optionId : undefined);
                sendJsonRpc(processHandle.child.stdin, {`,
  `                const selectedOptionId = choosePermissionOutcome(options)
                    ?? options.find((option) => option?.kind === "allow_once")?.optionId
                    ?? options.find((option) => option?.kind === "allow_always")?.optionId
                    ?? options.find((option) => typeof option?.optionId === "string")?.optionId
                    ?? (typeof options[0]?.optionId === "string" ? options[0].optionId : undefined);
                console.error("[ai-slide-acp-debug] " + JSON.stringify({
                    stage: "session/request_permission",
                    selectedOptionId: selectedOptionId ?? null,
                    optionCount: options.length,
                }));
                sendJsonRpc(processHandle.child.stdin, {`,
  'stage: "session/request_permission"',
);

patchFile(
  "cursor set_config_option",
  `        if (params.model) {
            await sendRequest("session/set_model", {
                ...(sessionId ? { sessionId } : {}),
                modelId: params.model,
            });
        }`,
  `        if (params.model && sessionId) {
            try {
                await sendRequest("session/set_config_option", {
                    sessionId,
                    configId: "model",
                    value: params.model,
                });
            }
            catch (modelConfigError) {
                console.error("[ai-slide-acp-debug] " + JSON.stringify({
                    stage: "session/set_config_option",
                    model: params.model,
                    error: modelConfigError instanceof Error ? modelConfigError.message : String(modelConfigError),
                }));
                await sendRequest("session/set_model", {
                    sessionId,
                    modelId: params.model,
                });
            }
        }`,
  "session/set_config_option",
);

patchFile(
  "concurrent acp lifecycle streaming",
  `    try {
        await sendRequest("initialize", {
            clientInfo: { name: "agent-acp-kit", version: "0.0.0" },
            protocolVersion: 1,
        });
        const newSessionResult = await sendRequest("session/new", buildAcpSessionNewParams(params.cwd, params.mcpServers || params.resume
            ? {
                ...(params.mcpServers ? { mcpServers: params.mcpServers } : {}),
                ...(params.resume ? { resume: params.resume } : {}),
            }
            : undefined));
        captureSessionMetadata(newSessionResult);
        if (params.model && sessionId) {
            try {
                await sendRequest("session/set_config_option", {
                    sessionId,
                    configId: "model",
                    value: params.model,
                });
            }
            catch (modelConfigError) {
                console.error("[ai-slide-acp-debug] " + JSON.stringify({
                    stage: "session/set_config_option",
                    model: params.model,
                    error: modelConfigError instanceof Error ? modelConfigError.message : String(modelConfigError),
                }));
                await sendRequest("session/set_model", {
                    sessionId,
                    modelId: params.model,
                });
            }
        }
        const promptContent = typeof params.prompt === "string"
            ? [{ type: "text", text: params.prompt }]
            : params.prompt;
        await sendRequest("session/prompt", {
            ...(sessionId ? { sessionId } : {}),
            prompt: promptContent,
        });
    }
    catch (error) {
        fatalError = true;
        queue.push({
            type: "error",
            code: "acp_lifecycle_failed",
            message: error instanceof Error ? error.message : "ACP lifecycle failed.",
        });
        processHandle.child.kill();
    }
    while (!done || queue.length > 0) {
        const next = queue.shift();
        if (next) {
            yield next;
            continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }`,
  `    let lifecycleSettled = false;
    const runLifecycle = async () => {
        try {
            console.error("[ai-slide-acp-debug] " + JSON.stringify({ stage: "initialize" }));
            await sendRequest("initialize", {
                clientInfo: { name: "agent-acp-kit", version: "0.0.0" },
                protocolVersion: 1,
                clientCapabilities: {
                    fs: { readTextFile: false, writeTextFile: false },
                    terminal: false,
                    _meta: { terminal_output: true },
                },
            });
            console.error("[ai-slide-acp-debug] " + JSON.stringify({ stage: "session/new", cwd: params.cwd }));
            const newSessionResult = await sendRequest("session/new", buildAcpSessionNewParams(params.cwd, params.mcpServers || params.resume
                ? {
                    ...(params.mcpServers ? { mcpServers: params.mcpServers } : {}),
                    ...(params.resume ? { resume: params.resume } : {}),
                }
                : undefined));
            captureSessionMetadata(newSessionResult);
            if (params.model && sessionId) {
                try {
                    console.error("[ai-slide-acp-debug] " + JSON.stringify({ stage: "session/set_config_option", model: params.model }));
                    await sendRequest("session/set_config_option", {
                        sessionId,
                        configId: "model",
                        value: params.model,
                    });
                }
                catch (modelConfigError) {
                    console.error("[ai-slide-acp-debug] " + JSON.stringify({
                        stage: "session/set_config_option",
                        model: params.model,
                        error: modelConfigError instanceof Error ? modelConfigError.message : String(modelConfigError),
                    }));
                    await sendRequest("session/set_model", {
                        sessionId,
                        modelId: params.model,
                    });
                }
            }
            const promptContent = typeof params.prompt === "string"
                ? [{ type: "text", text: params.prompt }]
                : params.prompt;
            console.error("[ai-slide-acp-debug] " + JSON.stringify({
                stage: "session/prompt",
                promptChars: typeof params.prompt === "string" ? params.prompt.length : JSON.stringify(promptContent).length,
            }));
            await sendRequest("session/prompt", {
                ...(sessionId ? { sessionId } : {}),
                prompt: promptContent,
            });
            console.error("[ai-slide-acp-debug] " + JSON.stringify({ stage: "session/prompt_done" }));
            queue.push({
                type: "done",
                status: "completed",
                reason: "completed",
                ...(sessionId ? { sessionId } : {}),
                ...(resumeToken ? { resumeToken } : {}),
            });
            processHandle.child.kill();
        }
        catch (error) {
            console.error("[ai-slide-acp-debug] " + JSON.stringify({
                stage: "acp_lifecycle",
                error: error instanceof Error ? error.message : String(error),
            }));
            fatalError = true;
            queue.push({
                type: "error",
                code: "acp_lifecycle_failed",
                message: error instanceof Error ? error.message : "ACP lifecycle failed.",
            });
            processHandle.child.kill();
        }
        finally {
            lifecycleSettled = true;
        }
    };
    void runLifecycle();
    while (queue.length > 0 || !lifecycleSettled) {
        const next = queue.shift();
        if (next) {
            yield next;
            continue;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }`,
  "lifecycleSettled",
);

patchFile(
  "permission auto-approve aliases",
  `export function choosePermissionOutcome(options = []) {
    return (options.find((option) => option.optionId === "approve_for_session")?.optionId ??
        options.find((option) => option.kind === "allow_always")?.optionId ??
        options.find((option) => option.kind === "allow_once")?.optionId ??
        null);
}`,
  `export function choosePermissionOutcome(options = []) {
    return (options.find((option) => option.optionId === "approve_for_session")?.optionId ??
        options.find((option) => option.kind === "allow_always")?.optionId ??
        options.find((option) => option.kind === "allow_once")?.optionId ??
        options.find((option) => option.optionId === "allow")?.optionId ??
        options.find((option) => option.optionId === "approve")?.optionId ??
        null);
}`,
  'option.optionId === "allow"',
  "permissions",
);

patchFile(
  "cursor mcp env uses name field",
  `            return {
                type: "stdio",
                name: server.name,
                command: server.command,
                args: server.args ?? [],
                env: server.env,
            };`,
  `            return {
                type: "stdio",
                name: server.name,
                command: server.command,
                args: server.args ?? [],
                env: Array.isArray(server.env)
                    ? server.env
                        .map((entry) => ({
                            name: typeof entry?.name === "string" ? entry.name : entry?.key,
                            value: entry?.value,
                        }))
                        .filter((entry) => typeof entry.name === "string" &&
                        entry.name.length > 0 &&
                        typeof entry.value === "string")
                    : [],
            };`,
  "entry?.key",
  "session",
);

if (changed) {
  writeFileSync(acpClientPath, source);
} else {
  console.log("[patch-agent-acp-kit-base] acp-client already patched");
}

if (sessionChanged) {
  writeFileSync(acpSessionPath, sessionSource);
} else {
  console.log("[patch-agent-acp-kit-base] acp-session already patched");
}

if (permissionsChanged) {
  writeFileSync(acpPermissionsPath, permissionsSource);
} else {
  console.log("[patch-agent-acp-kit-base] acp-permissions already patched");
}
