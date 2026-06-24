import type { DeckManifestSlide } from "@ai-slide/shared";
import type { DeckObjectElement } from "../artifact/deckInteractionLayer";
import { isElement, isInsideEditable } from "./deckEditorDom";
import type { TextEditEntryOptions } from "./deckEditorTypes";

export function attachDeckFrameEventHandlers(input: {
  slide: DeckManifestSlide;
  doc: Document;
  directTextEditModeRef: { current: boolean };
  readOnlyRef: { current: boolean };
  clearActiveSelection: (options?: { preserveToolbar?: boolean }) => void;
  enterTextEditMode: (slideId: string, object: DeckObjectElement, preferredTarget?: Element, options?: TextEditEntryOptions) => void;
  handleHistoryShortcut: (event: KeyboardEvent, slideId?: string | null) => void;
  handleSlideNavigationKeyboardEvent: (event: KeyboardEvent, fromSlideId?: string | null) => void;
  recordSlideHistory: (slideId: string, doc: Document) => void;
  rememberTextSelection: (slideId: string, doc: Document) => void;
  scheduleSlideSave: (slideId: string) => void;
  selectObject: (slideId: string, object: DeckObjectElement, mode?: "object" | "text", textTarget?: DeckObjectElement) => void;
  setActiveSlideId: (slideId: string) => void;
}) {
  input.doc.addEventListener(
    "mousedown",
    (event) => {
      if (!input.directTextEditModeRef.current || event.button !== 0 || isInsideEditable(event.target)) return;
      if (input.readOnlyRef.current) return;
      const target = isElement(event.target) ? event.target.closest<DeckObjectElement>('[data-object="true"]') : null;
      if (!target || target.getAttribute("data-object-type") !== "textbox") return;
      input.setActiveSlideId(input.slide.id);
      input.enterTextEditMode(input.slide.id, target, target, {
        deferToNativeSelection: true,
        selectContents: false,
        useObjectTextRoot: true,
      });
    },
    true,
  );
  input.doc.addEventListener(
    "click",
    (event) => {
      input.setActiveSlideId(input.slide.id);
      const target = isElement(event.target) ? event.target.closest<DeckObjectElement>('[data-object="true"]') : null;
      if (!target) {
        input.clearActiveSelection({ preserveToolbar: true });
        return;
      }
      if (isInsideEditable(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!input.readOnlyRef.current && target.getAttribute("data-object-type") === "textbox" && input.directTextEditModeRef.current) {
        input.enterTextEditMode(input.slide.id, target, target, {
          caretPoint: event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : undefined,
          selectContents: false,
          useObjectTextRoot: true,
        });
      } else {
        input.selectObject(input.slide.id, target);
      }
    },
    true,
  );
  input.doc.addEventListener(
    "dblclick",
    (event) => {
      input.setActiveSlideId(input.slide.id);
      const target = isElement(event.target) ? event.target.closest<DeckObjectElement>('[data-object="true"]') : null;
      if (!target) return;
      if (!input.readOnlyRef.current && target.getAttribute("data-object-type") === "textbox") input.enterTextEditMode(input.slide.id, target, isElement(event.target) ? event.target : undefined);
      else input.selectObject(input.slide.id, target);
    },
    true,
  );
  input.doc.addEventListener(
    "input",
    () => {
      if (input.readOnlyRef.current) return;
      input.rememberTextSelection(input.slide.id, input.doc);
      input.recordSlideHistory(input.slide.id, input.doc);
      input.scheduleSlideSave(input.slide.id);
    },
    true,
  );
  input.doc.addEventListener("selectionchange", () => input.rememberTextSelection(input.slide.id, input.doc));
  input.doc.addEventListener("keyup", () => input.rememberTextSelection(input.slide.id, input.doc), true);
  input.doc.addEventListener("mouseup", () => input.rememberTextSelection(input.slide.id, input.doc), true);
  input.doc.addEventListener(
    "keydown",
    (event) => {
      input.handleSlideNavigationKeyboardEvent(event, input.slide.id);
      input.handleHistoryShortcut(event, input.slide.id);
    },
    true,
  );
}
