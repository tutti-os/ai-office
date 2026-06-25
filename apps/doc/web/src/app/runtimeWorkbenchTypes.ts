import { type ToolbarLayoutValue } from "@ai-app/ui/toolbar";

export type InlineFormatTag = "strong" | "em" | "u" | "s";
export type HeadingTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote";
export type Alignment = "left" | "center" | "right" | "justify";
export type ListKind = "ordered" | "unordered";
export type ImageAttributes = {
  src: string;
  alt?: string;
  width?: string;
  height?: string;
};

export const tableEditActions = [
  "addRowBefore",
  "addRowAfter",
  "addColumnBefore",
  "addColumnAfter",
  "toggleHeaderRow",
  "toggleHeaderColumn",
  "deleteRow",
  "deleteColumn",
  "deleteTable",
  "splitCell",
] as const;
export type TableEditAction = (typeof tableEditActions)[number];
export type TableActionAvailability = Record<TableEditAction, boolean>;
export type TableHeaderState = {
  rowHeader: boolean;
  columnHeader: boolean;
};

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

export type EditorStats = {
  characterCount: number;
  wordCount: number;
  paragraphCount: number;
  elementCount: number;
};

export type HomePanel = "templates" | "history";

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
