export type ArtifactAppErrorCode =
  | "bad_request"
  | "conflict"
  | "forbidden"
  | "internal_error"
  | "not_found"
  | "toolchain_unavailable"
  | "unauthorized";

export class ArtifactAppError extends Error {
  readonly code: ArtifactAppErrorCode;
  readonly statusCode: number;
  readonly expose: boolean;

  constructor(input: {
    code: ArtifactAppErrorCode;
    message: string;
    statusCode?: number;
    expose?: boolean;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "ArtifactAppError";
    this.code = input.code;
    this.statusCode = input.statusCode ?? statusForCode(input.code);
    this.expose = input.expose ?? this.statusCode < 500;
  }
}

export type ArtifactErrorResponse = {
  error: string;
  code: ArtifactAppErrorCode;
};

export function artifactErrorResponse(error: unknown, fallback = "Unexpected server error") {
  const statusCode = statusForError(error);
  return {
    statusCode,
    body: {
      error: messageForError(error, fallback, statusCode),
      code: codeForError(error),
    } satisfies ArtifactErrorResponse,
  };
}

export function registerArtifactServerErrorHandlers(server: any, input: {
  appId: string;
}) {
  server.setErrorHandler((error: unknown, request: any, reply: any) => {
    const response = artifactErrorResponse(error);
    request.log?.error?.({ err: error, appId: input.appId, statusCode: response.statusCode }, "Unhandled artifact route error");
    if (reply.sent) return;
    return reply.code(response.statusCode).send(response.body);
  });
}

export function installArtifactProcessErrorHandlers(input: {
  appId: string;
  logger?: { error: (input: unknown, message?: string) => void };
  exitOnUncaughtException?: boolean;
}) {
  const logger = input.logger;
  const onUnhandledRejection = (reason: unknown) => {
    logger?.error({ err: reason, appId: input.appId }, "Unhandled artifact promise rejection");
  };
  const onUncaughtException = (error: Error) => {
    logger?.error({ err: error, appId: input.appId }, "Uncaught artifact server exception");
    if (input.exitOnUncaughtException ?? true) {
      setTimeout(() => process.exit(1), 50).unref();
    }
  };
  process.on("unhandledRejection", onUnhandledRejection);
  process.on("uncaughtException", onUncaughtException);
  return () => {
    process.off("unhandledRejection", onUnhandledRejection);
    process.off("uncaughtException", onUncaughtException);
  };
}

export function notFoundOrBadRequest(error: unknown) {
  const message = messageForError(error, "");
  if (message.toLowerCase().includes("not found") || message.toLowerCase().includes("no such file")) return 404;
  return 400;
}

export function statusForError(error: unknown) {
  if (error instanceof ArtifactAppError) return error.statusCode;
  if (isErrorWithStatusCode(error)) return error.statusCode;
  const message = rawMessageForError(error).toLowerCase();
  if (message.includes("stale")) return 409;
  if (message.includes("officecli")) return 503;
  if (message.includes("not found") || message.includes("no such file")) return 404;
  return 500;
}

export function codeForError(error: unknown): ArtifactAppErrorCode {
  if (error instanceof ArtifactAppError) return error.code;
  const statusCode = statusForError(error);
  if (statusCode === 401) return "unauthorized";
  if (statusCode === 403) return "forbidden";
  if (statusCode === 404) return "not_found";
  if (statusCode === 409) return "conflict";
  if (statusCode === 503) return "toolchain_unavailable";
  if (statusCode >= 500) return "internal_error";
  return "bad_request";
}

export function messageForError(error: unknown, fallback: string, statusCode?: number) {
  const resolvedStatusCode = statusCode ?? statusForError(error);
  if (error instanceof ArtifactAppError) return error.expose ? error.message : fallback;
  if (error instanceof Error && resolvedStatusCode < 500) return error.message;
  if (typeof error === "string" && resolvedStatusCode < 500) return error;
  return fallback;
}

function rawMessageForError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
}

function statusForCode(code: ArtifactAppErrorCode) {
  switch (code) {
    case "bad_request":
      return 400;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "toolchain_unavailable":
      return 503;
    case "internal_error":
      return 500;
  }
}

function isErrorWithStatusCode(error: unknown): error is { statusCode: number } {
  return Boolean(error && typeof error === "object" && "statusCode" in error && typeof (error as { statusCode?: unknown }).statusCode === "number");
}
