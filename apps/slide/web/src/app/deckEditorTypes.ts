import type { RichTextSelectionState } from "@ai-app/ui/rich-text";
import type { DeckResizeHandle } from "../artifact/deckInteractionLayer";

export type ActiveDeckObject = {
  slideId: string;
  objectId: string;
  objectType: string;
  label: string;
  movable: boolean;
};

export type ActiveDeckSelectionBox = {
  slideId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
};

export type ActiveTextEdit = {
  slideId: string;
  objectId: string;
  textTargetId: string;
};

export type ActiveTextSelection = ActiveTextEdit & {
  selection: RichTextSelectionState;
};

export type TextEditEntryOptions = {
  caretPoint?: { x: number; y: number };
  deferToNativeSelection?: boolean;
  selectContents?: boolean;
  useObjectTextRoot?: boolean;
};

export type DeckSelectionMode = "idle" | "object" | "text";
export type ResizeHandle = DeckResizeHandle;

export type SlideNavigationKeyboardEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
};

export type DeckToolbarState = {
  block: "normal" | "heading" | "shape" | "image";
  fontFamily: string;
  fontSize: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  textColor: string;
  fillColor: string;
  align: "left" | "center" | "right" | "";
};

export const defaultDeckToolbarState: DeckToolbarState = {
  block: "normal",
  fontFamily: "'PingFang SC', sans-serif",
  fontSize: "16",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: "#1f2937",
  fillColor: "#ffffff",
  align: "",
};

export const selectedDeckObjectToolbarState: DeckToolbarState = {
  block: "normal",
  fontFamily: "Inter, sans-serif",
  fontSize: "16",
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  textColor: "#000000",
  fillColor: "#ffffff",
  align: "",
};

export const deckFontOptions = [
  { value: "'PingFang SC', sans-serif", label: "PingFang SC" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "'IBM Plex Sans', sans-serif", label: "IBM Plex Sans" },
  { value: "'IBM Plex Mono', monospace", label: "IBM Plex Mono" },
  { value: "'JetBrains Mono', monospace", label: "JetBrains Mono" },
  { value: "'STIX Two Text', serif", label: "STIX Two Text" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', serif", label: "Times" },
];
