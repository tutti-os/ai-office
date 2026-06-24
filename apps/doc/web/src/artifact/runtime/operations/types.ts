export type InlineFormatTag = "strong" | "em" | "u" | "s";
export type HeadingTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote";
export type Alignment = "left" | "center" | "right" | "justify";
export type ListKind = "ordered" | "unordered";
export type AdjacentInsertPosition = "beforebegin" | "afterbegin" | "beforeend" | "afterend";
export const tableEditActions = [
  "addRowBefore",
  "addRowAfter",
  "addColumnBefore",
  "addColumnAfter",
  "toggleHeaderRow",
  "toggleHeaderColumn",
  "distributeRows",
  "distributeColumns",
  "copyRow",
  "copyColumn",
  "moveRowUp",
  "moveRowDown",
  "moveColumnLeft",
  "moveColumnRight",
  "deleteRow",
  "deleteColumn",
  "deleteTable",
  "mergeCellRight",
  "mergeCellDown",
  "splitCell",
] as const;
export type TableEditAction = (typeof tableEditActions)[number];
export type TableActionAvailability = Record<TableEditAction, boolean>;
export type TableBorderAction = "all" | "outer" | "inner" | "top" | "right" | "bottom" | "left" | "none";
export type TableHeaderState = {
  rowHeader: boolean;
  columnHeader: boolean;
};
export type TableGridSlot = {
  cell: HTMLTableCellElement;
  row: HTMLTableRowElement;
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  colSpan: number;
};
export type TableMergeRegion = {
  slots: TableGridSlot[];
  rowIndex: number;
  columnIndex: number;
  rowSpan: number;
  colSpan: number;
};
export type TableCellSelection = {
  table: HTMLTableElement;
  anchor: HTMLTableCellElement;
  focus: HTMLTableCellElement;
};
export type ImageAttributes = {
  src: string;
  alt?: string;
  width?: string;
  height?: string;
};
export type ElementStyleAttributes = {
  width?: string;
  height?: string;
  lineHeight?: string;
  letterSpacing?: string;
  verticalAlign?: string;
  borderWidth?: string;
  borderStyle?: string;
  borderColor?: string;
  borderRadius?: string;
  padding?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
};
export const presentationProperties = [
  "color",
  "backgroundColor",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "textDecoration",
  "letterSpacing",
  "lineHeight",
  "textAlign",
] as const;
export type PresentationProperty = (typeof presentationProperties)[number];
export type PresentationStyle = Partial<Record<PresentationProperty, string>>;

export const inlineCommandByTag: Record<InlineFormatTag, string> = {
  strong: "bold",
  em: "italic",
  u: "underline",
  s: "strikeThrough",
};

export const inlineFormatSelectorByTag: Record<InlineFormatTag, string> = {
  strong: "strong,b",
  em: "em,i",
  u: "u,ins",
  s: "s,strike,del",
};

export const inlineTags = ["b", "i", "u", "s", "strong", "em", "ins", "del", "mark", "small", "big", "span", "font"];
export const zeroWidthSpace = "\u200B";
export const tableCellSelectionAttribute = "data-ai-table-cell-selected";
export const tableCellSelections = new WeakMap<Document, TableCellSelection>();
export const blockSelector = [
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hgroup",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "ul",
].join(",");
