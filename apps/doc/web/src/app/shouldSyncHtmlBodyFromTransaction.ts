/** True only when a TipTap update should mark the HTML runtime dirty for human autosave. */
export function shouldSyncHtmlBodyFromTransaction(input: {
  focused: boolean;
  readOnly: boolean;
  transaction: { docChanged: boolean; getMeta: (key: string) => unknown };
}): boolean {
  if (input.readOnly) return false;
  if (!input.transaction.docChanged) return false;
  // Programmatic updates (setContent / remote apply) should opt out of history.
  if (input.transaction.getMeta("addToHistory") === false) return false;
  // Explicit user chrome: paste/cut/drop/composition always count.
  if (
    input.transaction.getMeta("uiEvent") ||
    input.transaction.getMeta("paste") === true ||
    input.transaction.getMeta("composition") != null
  ) {
    return true;
  }
  // Keyboard and toolbar edits usually lack uiEvent. Require focus so open/load
  // schema normalization cannot mark dirty without human interaction.
  return input.focused;
}
