// @vitest-environment jsdom
import React, { act, type ReactNode } from "react";
import { fireEvent, getByLabelText, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { AgentMentionProviderRoot } from "./AgentMentionProviderRoot";
import { AgentPromptRichTextInput } from "./AgentPromptRichTextInput";
import { AgentUserMessageRichText } from "./AgentUserMessageRichText";
import { createTuttiExternalMentionService } from "./tuttiMentionService";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = vi.fn();
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
}
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}

afterEach(() => {
  delete (window as Window & { tuttiExternal?: unknown }).tuttiExternal;
});

describe("agent mention components", () => {
  it("browses root, enters and leaves a folder, then writes only the selected folder path to the prompt", async () => {
    const directoryQueries: Array<{ directoryPath: string; maxResults?: number; providerId: string }> = [];
    const keywordQuery = vi.fn(async () => []);
    setTuttiExternal({
      query: keywordQuery,
      queryDirectory: async (input) => {
        directoryQueries.push(input);
        return input.directoryPath === "/workspace/reference-assets"
          ? [fileResult("/workspace/reference-assets/brief.md", "brief.md")]
          : [folderResult("/workspace/reference-assets", "reference-assets")];
      },
    });
    const service = createTuttiExternalMentionService();
    let promptValue = "";
    const view = render(
      <TestRoot service={service}>
        <AgentPromptRichTextInput
          className="composer-input"
          disabled={false}
          placeholder="Ask AI"
          value=""
          onChange={(value) => {
            promptValue = value;
          }}
          onSubmit={() => undefined}
        />
      </TestRoot>,
    );

    try {
      const editor = view.container.querySelector<HTMLElement>("[contenteditable=true]");
      expect(editor).toBeTruthy();
      await act(async () => {
        editor!.textContent = "@";
        fireEvent.input(editor!);
      });

      await waitFor(() => expect(directoryQueries).toContainEqual({
        directoryPath: "",
        maxResults: 30,
        providerId: "file",
      }));
      expect(keywordQuery).not.toHaveBeenCalled();
      await waitFor(() => expect(document.body.textContent).toContain("reference-assets"));

      await act(async () => getByLabelText(document.body, "Enter folder").click());
      await waitFor(() => expect(directoryQueries).toContainEqual({
        directoryPath: "/workspace/reference-assets",
        maxResults: 30,
        providerId: "file",
      }));
      await waitFor(() => expect(document.body.textContent).toContain("brief.md"));

      await act(async () => getByLabelText(document.body, "Back").click());
      await waitFor(() => expect(directoryQueries.filter((input) => input.directoryPath === "")).toHaveLength(2));
      await waitFor(() => expect(document.body.textContent).toContain("reference-assets"));

      const folderButton = Array.from(document.body.querySelectorAll("button")).find(
        (button) => button.textContent?.includes("reference-assets"),
      );
      expect(folderButton).toBeTruthy();
      await act(async () => folderButton!.click());
      await waitFor(() => expect(promptValue).toBe("[reference-assets](/workspace/reference-assets/)"));
    } finally {
      view.unmount();
      service.dispose();
    }
  });

  it("renders historical app and agent mentions through the real conversation message component", async () => {
    setTuttiExternal({ query: async () => [], queryDirectory: async () => [] });
    const service = createTuttiExternalMentionService();
    const view = render(
      <TestRoot service={service}>
        <AgentUserMessageRichText
          className="user-message"
          text="Ask [@Canvas](mention://workspace-app/canvas) and [@Automation Agent](mention://agent-target/team:automation)"
        />
      </TestRoot>,
    );

    try {
      await waitFor(() => expect(view.container.querySelectorAll(".tutti-rich-text-mention")).toHaveLength(2));
      const mentions = Array.from(view.container.querySelectorAll<HTMLElement>(".tutti-rich-text-mention"));
      expect(mentions.map((mention) => mention.dataset.providerId)).toEqual(["workspace-app", "agent-target"]);
      expect(view.container.textContent).toContain("Canvas");
      expect(view.container.textContent).toContain("Automation Agent");
    } finally {
      view.unmount();
      service.dispose();
    }
  });
});

function TestRoot(props: { children: ReactNode; service: ReturnType<typeof createTuttiExternalMentionService> }) {
  return (
    <AgentMentionProviderRoot service={props.service}>
      <I18nProvider>{props.children}</I18nProvider>
    </AgentMentionProviderRoot>
  );
}

function setTuttiExternal(at: {
  query(input: unknown): Promise<unknown[]>;
  queryDirectory(input: { directoryPath: string; maxResults?: number; providerId: string }): Promise<unknown[]>;
}) {
  (window as Window & { tuttiExternal?: { at: typeof at } }).tuttiExternal = { at };
}

function folderResult(path: string, label: string) {
  return {
    providerId: "file",
    itemId: path,
    label,
    subtitle: path,
    directory: { path, childCount: 1 },
    insert: { kind: "markdown-link", label, href: `${path}/` },
  };
}

function fileResult(path: string, label: string) {
  return {
    providerId: "file",
    itemId: path,
    label,
    subtitle: path,
    insert: { kind: "markdown-link", label, href: path },
  };
}
