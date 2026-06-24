export function parseCustomAttributes(input: string) {
  const attributes: Record<string, string | null> = {};
  input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separator = line.indexOf("=");
      if (separator < 0) {
        attributes[line] = null;
        return;
      }
      const name = line.slice(0, separator).trim();
      if (!name) return;
      attributes[name] = line.slice(separator + 1).trim();
    });
  return attributes;
}
