export interface CliJsonOutput {
  kind: "json";
  value: unknown;
}

export interface CliTableColumn {
  key: string;
  label: string;
}

export interface CliTableOutput {
  kind: "table";
  columns: CliTableColumn[];
  rows: Record<string, unknown>[];
}

export interface CliErrorOutput {
  kind: "error";
  error: {
    code: string;
    message: string;
  };
}

export type CliCommandOutput = CliJsonOutput | CliTableOutput | CliErrorOutput;

export function cliJsonOutput(value: unknown): CliJsonOutput {
  return { kind: "json", value };
}

export function cliTableOutput(columns: CliTableColumn[], rows: Record<string, unknown>[]): CliTableOutput {
  return { kind: "table", columns, rows };
}

export function cliErrorOutput(code: string, message: string): CliErrorOutput {
  return { kind: "error", error: { code, message } };
}

export function readCliInputBody(body: unknown): Record<string, unknown> {
  const input = unwrapCliInputBody(body);
  return isRecord(input) ? input : {};
}

function unwrapCliInputBody(body: unknown) {
  if (!isRecord(body) || !isCliInvokeEnvelope(body)) return body;
  return body.input ?? {};
}

function isCliInvokeEnvelope(body: Record<string, unknown>) {
  const keys = Object.keys(body);
  if (!Object.hasOwn(body, "input")) return false;
  if (body.schemaVersion === "tutti.app.cli.invoke.v1") return true;
  if (
    Object.hasOwn(body, "commandId") &&
    Object.hasOwn(body, "appId") &&
    Object.hasOwn(body, "scope") &&
    Object.hasOwn(body, "path")
  ) {
    return true;
  }
  return keys.length > 0 && keys.every((key) => key === "input" || key === "outputMode" || key === "context");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
