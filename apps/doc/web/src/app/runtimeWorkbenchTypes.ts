import { type ToolbarLayoutValue } from "@ai-app/ui/toolbar";
import {
  getEditorStats,
  tableEditActions,
  type Alignment,
  type HeadingTag,
  type ListKind,
  type TableActionAvailability,
  type TableHeaderState,
} from "../artifact/runtime/operations";

export type ToolbarState = {
  targetLabel: string;
  block: HeadingTag;
  fontFamily: string;
  fontSize: string;
  foreColor: string;
  backColor: string;
  lineHeight: string;
  letterSpacing: string;
  layout: ToolbarLayoutValue;
  alignment: Alignment;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  link: boolean;
  list: ListKind | null;
  checklist: boolean;
  table: boolean;
  tableActions: TableActionAvailability;
  tableHeaderState: TableHeaderState;
  image: boolean;
  attributeElement: boolean;
  mutableElement: boolean;
  contentElement: boolean;
  textSelection: boolean;
  rangeSelection: boolean;
};

export type AttributeDraft = { id: string; className: string; title: string; custom: string };

export const operationPanelModes = [
  "insertText",
  "insertHtml",
  "replaceSelection",
  "appendText",
  "appendHtml",
  "insertAtPosition",
  "setAttributes",
  "wrapSelection",
  "image",
  "style",
  "table",
] as const;

export type OperationPanelMode = (typeof operationPanelModes)[number] | null;

export type EditorStats = ReturnType<typeof getEditorStats>;

export type HomePanel = "templates" | "history";

export type ResizeHandle = "top-left" | "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left";

export type ImageObjectElement = HTMLElement;

export type LinkDraft = {
  text: string;
  href: string;
};

export const defaultToolbarState: ToolbarState = {
  targetLabel: "doc",
  block: "p",
  fontFamily: "Arial, sans-serif",
  fontSize: "",
  foreColor: "#111111",
  backColor: "#fff2a8",
  lineHeight: "",
  letterSpacing: "",
  layout: {
    marginTop: "",
    marginRight: "",
    marginBottom: "",
    marginLeft: "",
    paddingTop: "",
    paddingRight: "",
    paddingBottom: "",
    paddingLeft: "",
  },
  alignment: "left",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  link: false,
  list: null,
  checklist: false,
  table: false,
  tableActions: defaultTableActions(),
  tableHeaderState: defaultTableHeaderState(),
  image: false,
  attributeElement: false,
  mutableElement: false,
  contentElement: false,
  textSelection: false,
  rangeSelection: false,
};

export const operationPanelTitle: Record<Exclude<OperationPanelMode, null>, string> = {
  insertText: "Insert text",
  insertHtml: "Insert HTML",
  replaceSelection: "Replace selection",
  appendText: "Append text",
  appendHtml: "Append HTML",
  insertAtPosition: "Insert at position",
  setAttributes: "Set attributes",
  wrapSelection: "Wrap selection",
  image: "Image",
  style: "Style",
  table: "Table",
};

function defaultTableActions(): TableActionAvailability {
  return tableEditActions.reduce((actions, action) => {
    actions[action] = false;
    return actions;
  }, {} as TableActionAvailability);
}

function defaultTableHeaderState(): TableHeaderState {
  return {
    rowHeader: false,
    columnHeader: false,
  };
}
