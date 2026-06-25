import { Extension, Mark, Node, mergeAttributes, type Editor } from "@tiptap/core";
import type { RawCommands } from "@tiptap/core";
import type { SelectionState } from "../artifact/runtime/types";
import { tableEditActions, type Alignment, type TableActionAvailability, type ToolbarState } from "./runtimeWorkbenchTypes";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    aiFontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const AiFontSize = Extension.create({
  name: "aiFontSize",

  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.fontSize || null,
            renderHTML: (attributes: Record<string, unknown>) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).run(),
    } as Partial<RawCommands>;
  },
});

export const AiBlockStyle = Extension.create({
  name: "aiBlockStyle",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading", "blockquote", "listItem", "taskItem"],
        attributes: Object.fromEntries(
          blockStyleAttributes.map(({ name, property }) => [
            name,
            {
              default: null,
              parseHTML: (element: HTMLElement) => element.style.getPropertyValue(property) || null,
              renderHTML: (attributes: Record<string, unknown>) => {
                const value = attributes[name];
                return typeof value === "string" && value ? { style: `${property}: ${value}` } : {};
              },
            },
          ]),
        ),
      },
    ];
  },
});

export const AiHtmlAttributes = Extension.create({
  name: "aiHtmlAttributes",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "bulletList",
          "orderedList",
          "listItem",
          "taskList",
          "taskItem",
          "image",
          "table",
          "tableRow",
          "tableCell",
          "tableHeader",
        ],
        attributes: commonHtmlAttributes(),
      },
    ];
  },
});

export const AiHtmlSpan = Mark.create({
  name: "htmlSpan",

  addAttributes() {
    return commonHtmlAttributes();
  },

  parseHTML() {
    return [{ tag: "span" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },
});

export const AiHtmlSmall = Mark.create({
  name: "htmlSmall",

  addAttributes() {
    return commonHtmlAttributes();
  },

  parseHTML() {
    return [{ tag: "small" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["small", mergeAttributes(HTMLAttributes), 0];
  },
});

export const AiHtmlContainerDiv = Node.create({
  name: "htmlContainerDiv",
  group: "block",
  content: "block*",
  defining: true,

  addAttributes() {
    return commonHtmlAttributes();
  },

  parseHTML() {
    return [
      {
        tag: "div",
        priority: 100,
        getAttrs: (node) => (node instanceof HTMLElement && hasBlockChild(node) ? null : false),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },
});

export const AiHtmlLeafDiv = Node.create({
  name: "htmlLeafDiv",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return commonHtmlAttributes();
  },

  parseHTML() {
    return [
      {
        tag: "div",
        priority: 90,
        getAttrs: (node) => (node instanceof HTMLElement && !hasBlockChild(node) ? null : false),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },
});

export const AiHtmlBlockElement = Node.create({
  name: "htmlBlockElement",
  group: "block",
  content: "block*",
  defining: true,

  addAttributes() {
    return {
      tagName: {
        default: "section",
        parseHTML: (element: HTMLElement) => element.tagName.toLowerCase(),
        renderHTML: () => ({}),
      },
      ...commonHtmlAttributes(),
    };
  },

  parseHTML() {
    return blockContainerTags.map((tag) => ({
      tag,
      priority: 80,
      getAttrs: (node) => (node instanceof HTMLElement && hasBlockChild(node) ? null : false),
    }));
  },

  renderHTML({ node, HTMLAttributes }) {
    const { tagName: _tagName, ...attributes } = HTMLAttributes as Record<string, unknown>;
    const tagName = node.attrs.tagName as unknown;
    return [typeof tagName === "string" && blockContainerTagSet.has(tagName) ? tagName : "section", mergeAttributes(attributes), 0];
  },
});

export const AiHtmlLeafBlockElement = Node.create({
  name: "htmlLeafBlockElement",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      tagName: {
        default: "section",
        parseHTML: (element: HTMLElement) => element.tagName.toLowerCase(),
        renderHTML: () => ({}),
      },
      ...commonHtmlAttributes(),
    };
  },

  parseHTML() {
    return leafBlockTags.map((tag) => ({
      tag,
      priority: 75,
      getAttrs: (node) => (node instanceof HTMLElement && !hasBlockChild(node) ? null : false),
    }));
  },

  renderHTML({ node, HTMLAttributes }) {
    const { tagName: _tagName, ...attributes } = HTMLAttributes as Record<string, unknown>;
    const tagName = node.attrs.tagName as unknown;
    return [typeof tagName === "string" && leafBlockTagSet.has(tagName) ? tagName : "section", mergeAttributes(attributes), 0];
  },
});

export const AiHtmlInput = Node.create({
  name: "htmlInput",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      ...commonHtmlAttributes(),
      type: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("type"),
        renderHTML: (attributes: Record<string, unknown>) => renderAttribute("type", attributes.type),
      },
      value: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("value"),
        renderHTML: (attributes: Record<string, unknown>) => renderAttribute("value", attributes.value),
      },
      placeholder: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("placeholder"),
        renderHTML: (attributes: Record<string, unknown>) => renderAttribute("placeholder", attributes.placeholder),
      },
      checked: {
        default: null,
        parseHTML: (element: HTMLElement) => element.hasAttribute("checked") ? "" : null,
        renderHTML: (attributes: Record<string, unknown>) => attributes.checked === "" ? { checked: "" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "input" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["input", mergeAttributes(HTMLAttributes)];
  },
});

export const AiHtmlIcon = Node.create({
  name: "htmlIcon",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return commonHtmlAttributes();
  },

  parseHTML() {
    return [{ tag: "i" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["i", mergeAttributes(HTMLAttributes)];
  },
});

export const AiHtmlInlineSvg = Node.create({
  name: "htmlInlineSvg",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return rawSvgAttributes();
  },

  parseHTML() {
    return [
      {
        tag: "svg",
        priority: 130,
        getAttrs: (node) => {
          if (!(node instanceof Element)) return false;
          const parent = node.parentElement;
          return parent && hasBlockChild(parent) ? false : { rawHTML: node.outerHTML };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["svg", mergeAttributes({ "data-ai-raw-svg": HTMLAttributes.rawHTML || "" })];
  },

  addNodeView() {
    return ({ node }) => {
      const svg = svgElementFromRawHTML(node.attrs.rawHTML);
      return { dom: svg as unknown as HTMLElement };
    };
  },
});

export const AiHtmlBlockSvg = Node.create({
  name: "htmlBlockSvg",
  group: "block",
  atom: true,

  addAttributes() {
    return rawSvgAttributes();
  },

  parseHTML() {
    return [
      {
        tag: "svg",
        priority: 120,
        getAttrs: (node) => {
          if (!(node instanceof Element)) return false;
          const parent = node.parentElement;
          return !parent || parent.tagName.toLowerCase() === "body" || hasBlockChild(parent) ? { rawHTML: node.outerHTML } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["svg", mergeAttributes({ "data-ai-raw-svg": HTMLAttributes.rawHTML || "" })];
  },

  addNodeView() {
    return ({ node }) => {
      const svg = svgElementFromRawHTML(node.attrs.rawHTML);
      return { dom: svg as unknown as HTMLElement };
    };
  },
});

export const AiHtmlSvgGroup = Node.create({
  name: "htmlSvgGroup",
  group: "htmlSvgChild",
  content: "htmlSvgChild*",

  addAttributes() {
    return svgAttributes();
  },

  parseHTML() {
    return [{ tag: "g" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["g", mergeAttributes(HTMLAttributes), 0];
  },
});

export const AiHtmlSvgPath = Node.create({
  name: "htmlSvgPath",
  group: "htmlSvgChild",
  atom: true,

  addAttributes() {
    return svgAttributes();
  },

  parseHTML() {
    return [{ tag: "path" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["path", mergeAttributes(HTMLAttributes)];
  },
});

export const AiHtmlSvgLine = Node.create({
  name: "htmlSvgLine",
  group: "htmlSvgChild",
  atom: true,

  addAttributes() {
    return svgAttributes();
  },

  parseHTML() {
    return [{ tag: "line" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["line", mergeAttributes(HTMLAttributes)];
  },
});

export const AiHtmlSvgCircle = Node.create({
  name: "htmlSvgCircle",
  group: "htmlSvgChild",
  atom: true,

  addAttributes() {
    return svgAttributes();
  },

  parseHTML() {
    return [{ tag: "circle" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["circle", mergeAttributes(HTMLAttributes)];
  },
});

export function selectionStateFromTiptap(editor: Editor): SelectionState {
  const { from, to, anchor, head } = editor.state.selection;
  const selectedText = editor.state.doc.textBetween(from, to, "\n");
  const selectedHtml = selectedText ? selectedHtmlFromTiptap(editor) : "";
  return {
    selectedText,
    selectedHtml,
    selectionType: from === to ? "write" : "text",
    anchorPath: `tiptap:${anchor}`,
    focusPath: `tiptap:${head}`,
    commonAncestorPath: "tiptap:body",
    startPath: `tiptap:${from}`,
    startOffset: from,
    endPath: `tiptap:${to}`,
    endOffset: to,
  };
}

export function toolbarStateFromTiptap(editor: Editor, fallback: ToolbarState): ToolbarState {
  const color = editor.getAttributes("textStyle").color;
  const fontFamily = editor.getAttributes("textStyle").fontFamily;
  const fontSize = editor.getAttributes("textStyle").fontSize;
  const highlight = editor.getAttributes("highlight").color;
  const blockAttributes = currentBlockAttributes(editor);
  const textAlign = blockAttributes.textAlign;
  return {
    ...fallback,
    block: activeBlock(editor),
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strikethrough: editor.isActive("strike"),
    link: editor.isActive("link"),
    list: editor.isActive("orderedList") ? "ordered" : editor.isActive("bulletList") ? "unordered" : null,
    checklist: editor.isActive("taskList"),
    alignment: alignmentFromAttribute(textAlign),
    fontFamily: typeof fontFamily === "string" ? fontFamily : fallback.fontFamily,
    fontSize: typeof fontSize === "string" ? fontSize : fallback.fontSize,
    foreColor: typeof color === "string" ? color : fallback.foreColor,
    backColor: typeof highlight === "string" ? highlight : fallback.backColor,
    lineHeight: blockAttributes.lineHeight || fallback.lineHeight,
    letterSpacing: blockAttributes.letterSpacing || fallback.letterSpacing,
    layout: {
      ...fallback.layout,
      marginTop: blockAttributes.marginTop || fallback.layout.marginTop,
      marginRight: blockAttributes.marginRight || fallback.layout.marginRight,
      marginBottom: blockAttributes.marginBottom || fallback.layout.marginBottom,
      marginLeft: blockAttributes.marginLeft || fallback.layout.marginLeft,
      paddingTop: blockAttributes.paddingTop || fallback.layout.paddingTop,
      paddingRight: blockAttributes.paddingRight || fallback.layout.paddingRight,
      paddingBottom: blockAttributes.paddingBottom || fallback.layout.paddingBottom,
      paddingLeft: blockAttributes.paddingLeft || fallback.layout.paddingLeft,
    },
    rangeSelection: !editor.state.selection.empty,
    contentElement: true,
    mutableElement: true,
    targetLabel: "Text",
    table: editor.isActive("table"),
    tableActions: tableActionsFromTiptap(editor),
    image: editor.isActive("image"),
  };
}

export function tableActionsFromTiptap(editor: Editor): TableActionAvailability {
  const actions = defaultTableActions();
  try {
    if (!editor.isActive("table")) return actions;
    actions.addRowBefore = canRunCommand(editor, "addRowBefore");
    actions.addRowAfter = canRunCommand(editor, "addRowAfter");
    actions.addColumnBefore = canRunCommand(editor, "addColumnBefore");
    actions.addColumnAfter = canRunCommand(editor, "addColumnAfter");
    actions.toggleHeaderRow = canRunCommand(editor, "toggleHeaderRow");
    actions.toggleHeaderColumn = canRunCommand(editor, "toggleHeaderColumn");
    actions.deleteRow = canRunCommand(editor, "deleteRow");
    actions.deleteColumn = canRunCommand(editor, "deleteColumn");
    actions.deleteTable = canRunCommand(editor, "deleteTable");
    actions.splitCell = canRunCommand(editor, "splitCell");
  } catch {
    return actions;
  }
  return actions;
}

function activeBlock(editor: Editor) {
  if (editor.isActive("heading", { level: 1 })) return "h1";
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  if (editor.isActive("heading", { level: 4 })) return "h4";
  if (editor.isActive("heading", { level: 5 })) return "h5";
  if (editor.isActive("heading", { level: 6 })) return "h6";
  return "p";
}

function selectedHtmlFromTiptap(editor: Editor) {
  const holder = document.createElement("div");
  const selectedContent = editor.state.selection.content().content;
  const selectedText = selectedContent.textBetween(0, selectedContent.size, "\n");
  let view: Editor["view"] | null = null;
  try {
    view = editor.view;
  } catch {
    holder.textContent = selectedText;
    return holder.innerHTML;
  }
  const fragment = view.dom.ownerDocument.createDocumentFragment();
  view.someProp("clipboardSerializer", (serializer) => {
    fragment.append(serializer.serializeFragment(selectedContent));
  });
  if (!fragment.childNodes.length) fragment.append(view.dom.ownerDocument.createTextNode(selectedText));
  holder.append(fragment);
  return holder.innerHTML;
}

function currentBlockAttributes(editor: Editor) {
  return editor.isActive("heading")
    ? editor.getAttributes("heading")
    : editor.isActive("blockquote")
      ? editor.getAttributes("blockquote")
      : editor.isActive("taskItem")
        ? editor.getAttributes("taskItem")
        : editor.isActive("listItem")
          ? editor.getAttributes("listItem")
          : editor.getAttributes("paragraph");
}

function alignmentFromAttribute(value: unknown): Alignment {
  return value === "center" || value === "right" || value === "justify" ? value : "left";
}

function defaultTableActions(): TableActionAvailability {
  return tableEditActions.reduce((actions, action) => {
    actions[action] = false;
    return actions;
  }, {} as TableActionAvailability);
}

function canRunCommand(editor: Editor, commandName: string) {
  try {
    const command = (editor.can() as unknown as Record<string, unknown>)[commandName];
    return typeof command === "function" ? Boolean(command()) : false;
  } catch {
    return false;
  }
}

const blockStyleAttributes = [
  { name: "lineHeight", property: "line-height" },
  { name: "letterSpacing", property: "letter-spacing" },
  { name: "marginTop", property: "margin-top" },
  { name: "marginRight", property: "margin-right" },
  { name: "marginBottom", property: "margin-bottom" },
  { name: "marginLeft", property: "margin-left" },
  { name: "paddingTop", property: "padding-top" },
  { name: "paddingRight", property: "padding-right" },
  { name: "paddingBottom", property: "padding-bottom" },
  { name: "paddingLeft", property: "padding-left" },
] as const;

const blockChildTags = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "details",
  "dialog",
  "div",
  "dl",
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
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "ul",
]);

const blockContainerTags = ["article", "aside", "footer", "header", "main", "section"] as const;
const leafBlockTags = ["button", "label", ...blockContainerTags] as const;
const blockContainerTagSet = new Set<string>(blockContainerTags);
const leafBlockTagSet = new Set<string>(leafBlockTags);

function hasBlockChild(element: HTMLElement) {
  return Array.from(element.children).some((child) => blockChildTags.has(child.tagName.toLowerCase()));
}

function commonHtmlAttributes() {
  return {
    id: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("id"),
      renderHTML: (attributes: Record<string, unknown>) => renderAttribute("id", attributes.id),
    },
    class: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("class"),
      renderHTML: (attributes: Record<string, unknown>) => renderAttribute("class", attributes.class),
    },
    style: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("style"),
      renderHTML: (attributes: Record<string, unknown>) => renderAttribute("style", attributes.style),
    },
    title: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("title"),
      renderHTML: (attributes: Record<string, unknown>) => renderAttribute("title", attributes.title),
    },
    role: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("role"),
      renderHTML: (attributes: Record<string, unknown>) => renderAttribute("role", attributes.role),
    },
    width: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("width"),
      renderHTML: (attributes: Record<string, unknown>) => renderAttribute("width", attributes.width),
    },
    height: {
      default: null,
      parseHTML: (element: HTMLElement) => element.getAttribute("height"),
      renderHTML: (attributes: Record<string, unknown>) => renderAttribute("height", attributes.height),
    },
  };
}

function svgAttributes() {
  return Object.fromEntries(
    svgAttributeNames.map((name) => [
      name,
      {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute(name),
        renderHTML: (attributes: Record<string, unknown>) => renderAttribute(name, attributes[name]),
      },
    ]),
  );
}

function rawSvgAttributes() {
  return {
    rawHTML: {
      default: "",
      parseHTML: (element: Element) => element.outerHTML,
      renderHTML: () => ({}),
    },
  };
}

function svgElementFromRawHTML(rawHTML: unknown) {
  if (typeof rawHTML === "string" && rawHTML.trim()) {
    const parsed = new DOMParser().parseFromString(rawHTML, "image/svg+xml");
    const svg = parsed.documentElement;
    if (svg?.tagName.toLowerCase() === "svg") return document.importNode(svg, true);
  }
  return document.createElementNS("http://www.w3.org/2000/svg", "svg");
}

function renderAttribute(name: string, value: unknown) {
  return typeof value === "string" && value ? { [name]: value } : {};
}

const svgAttributeNames = [
  "class",
  "style",
  "viewBox",
  "fill",
  "stroke",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-width",
  "xmlns",
  "d",
  "opacity",
  "cx",
  "cy",
  "r",
  "x1",
  "y1",
  "x2",
  "y2",
  "width",
  "height",
] as const;
