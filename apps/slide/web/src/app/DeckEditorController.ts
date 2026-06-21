import { updateDeckSlideHtml } from "../api/projects";
import { applySlideHtmlSnapshot, prepareSlideEditorDocument, serializeSlideDocument } from "./deckEditorDom";

type FrameRecord = {
  iframe: HTMLIFrameElement;
  saveTimer: ReturnType<typeof setTimeout> | null;
};

type DeckSlideHistory = {
  entries: string[];
  currentIndex: number;
};

const maxDeckHistoryEntries = 100;

export class DeckEditorController {
  private readonly frameRecords = new Map<string, FrameRecord>();
  private readonly initializedFrameDocs = new WeakSet<Document>();
  private readonly slideHistories = new Map<string, DeckSlideHistory>();
  private readonly applyingHistory = new Set<string>();
  private readonly pendingSaveSlides = new Set<string>();
  private readonly savingSlides = new Set<string>();
  private hasSaveError = false;

  constructor(
    private readonly deps: {
      fileRef: string;
      projectId: string;
      onHistoryChange: () => void;
      onSaveStateChange: (state: "saved" | "saving" | "error") => void;
    },
  ) {}

  dispose() {
    for (const record of this.frameRecords.values()) {
      if (record.saveTimer) clearTimeout(record.saveTimer);
    }
    this.frameRecords.clear();
    this.pendingSaveSlides.clear();
    this.savingSlides.clear();
  }

  registerFrame(slideId: string, iframe: HTMLIFrameElement) {
    const previous = this.frameRecords.get(slideId);
    if (previous?.iframe !== iframe) {
      if (previous?.saveTimer) clearTimeout(previous.saveTimer);
      this.frameRecords.set(slideId, { iframe, saveTimer: null });
    }
  }

  getDocument(slideId: string) {
    return this.frameRecords.get(slideId)?.iframe.contentDocument ?? null;
  }

  getIframe(slideId: string) {
    return this.frameRecords.get(slideId)?.iframe ?? null;
  }

  getDocuments() {
    return Array.from(this.frameRecords.values())
      .map((record) => record.iframe.contentDocument)
      .filter((doc): doc is Document => Boolean(doc));
  }

  isFrameInitialized(doc: Document) {
    return this.initializedFrameDocs.has(doc);
  }

  markFrameInitialized(doc: Document) {
    this.initializedFrameDocs.add(doc);
  }

  getHistory(slideId: string | null) {
    return slideId ? this.slideHistories.get(slideId) ?? null : null;
  }

  ensureInitialHistory(slideId: string, doc: Document) {
    if (this.slideHistories.has(slideId)) return;
    this.slideHistories.set(slideId, {
      entries: [serializeSlideDocument(doc)],
      currentIndex: 0,
    });
    this.deps.onHistoryChange();
  }

  recordHistory(slideId: string, doc: Document) {
    if (this.applyingHistory.has(slideId)) return;
    const html = serializeSlideDocument(doc);
    const current = this.slideHistories.get(slideId);
    if (current?.entries[current.currentIndex] === html) return;
    const entries = current ? current.entries.slice(0, current.currentIndex + 1) : [];
    entries.push(html);
    if (entries.length > maxDeckHistoryEntries) entries.splice(0, entries.length - maxDeckHistoryEntries);
    this.slideHistories.set(slideId, {
      entries,
      currentIndex: entries.length - 1,
    });
    this.deps.onHistoryChange();
  }

  scheduleSave(slideId: string) {
    const record = this.frameRecords.get(slideId);
    const doc = record?.iframe.contentDocument;
    if (!record || !doc) return;
    if (record.saveTimer) clearTimeout(record.saveTimer);
    this.hasSaveError = false;
    this.pendingSaveSlides.add(slideId);
    this.deps.onSaveStateChange("saving");
    record.saveTimer = setTimeout(() => {
      record.saveTimer = null;
      this.pendingSaveSlides.delete(slideId);
      this.savingSlides.add(slideId);
      this.deps.onSaveStateChange("saving");
      const html = serializeSlideDocument(doc);
      void updateDeckSlideHtml(this.deps.projectId, slideId, { html })
        .then(() => {
          this.savingSlides.delete(slideId);
          this.publishSaveState();
        })
        .catch(() => {
          this.savingSlides.delete(slideId);
          this.hasSaveError = true;
          this.publishSaveState();
        });
    }, 650);
  }

  private publishSaveState() {
    if (this.hasSaveError) {
      this.deps.onSaveStateChange("error");
      return;
    }
    this.deps.onSaveStateChange(this.pendingSaveSlides.size || this.savingSlides.size ? "saving" : "saved");
  }

  applyHistoryOffset(slideId: string | null, offset: -1 | 1) {
    if (!slideId) return null;
    const history = this.slideHistories.get(slideId);
    if (!history) return null;
    const nextIndex = history.currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= history.entries.length) return null;
    const doc = this.getDocument(slideId);
    if (!doc) return null;

    this.applyingHistory.add(slideId);
    try {
      applySlideHtmlSnapshot(doc, history.entries[nextIndex]);
      prepareSlideEditorDocument(doc, { fileRef: this.deps.fileRef, projectId: this.deps.projectId });
      history.currentIndex = nextIndex;
      this.slideHistories.set(slideId, history);
      this.scheduleSave(slideId);
      this.deps.onHistoryChange();
      return { doc, slideId };
    } finally {
      this.applyingHistory.delete(slideId);
    }
  }
}
