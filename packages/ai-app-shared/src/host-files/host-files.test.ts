import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { openExportLocation, revealPathInHostFiles } from "./index.js";

type HostWindow = {
  tuttiExternal?: {
    files?: {
      open?: (input: { path: string; mode?: string }) => Promise<void>;
    };
  };
};

function setHostWindow(value: HostWindow | undefined) {
  (globalThis as { window?: HostWindow }).window = value;
}

afterEach(() => {
  setHostWindow(undefined);
});

describe("revealPathInHostFiles", () => {
  it("returns false when tuttiExternal is absent", async () => {
    setHostWindow({});
    assert.equal(await revealPathInHostFiles("/workspace/.tsh/apps/data/app/exports/a.html"), false);
  });

  it("reveals through tuttiExternal.files.open", async () => {
    const calls: Array<{ path: string; mode?: string }> = [];
    setHostWindow({
      tuttiExternal: {
        files: {
          open: async (input) => {
            calls.push(input);
          },
        },
      },
    });

    assert.equal(await revealPathInHostFiles(" /workspace/export.html "), true);
    assert.deepEqual(calls, [{ path: "/workspace/export.html", mode: "reveal" }]);
  });
});

describe("openExportLocation", () => {
  it("uses host reveal when available and skips the OS fallback", async () => {
    let fallbackCalls = 0;
    setHostWindow({
      tuttiExternal: {
        files: {
          open: async () => undefined,
        },
      },
    });

    await openExportLocation({
      path: "/workspace/export.html",
      openExportsDir: async () => {
        fallbackCalls += 1;
      },
    });

    assert.equal(fallbackCalls, 0);
  });

  it("falls back to openExportsDir when the host bridge is missing", async () => {
    let fallbackCalls = 0;
    setHostWindow({});

    await openExportLocation({
      path: "/tmp/export.html",
      openExportsDir: async () => {
        fallbackCalls += 1;
      },
    });

    assert.equal(fallbackCalls, 1);
  });

  it("does not fall back to OS open when host reveal throws", async () => {
    let fallbackCalls = 0;
    setHostWindow({
      tuttiExternal: {
        files: {
          open: async () => {
            throw new Error("bridge failed");
          },
        },
      },
    });

    await assert.rejects(
      () =>
        openExportLocation({
          path: "/workspace/export.html",
          openExportsDir: async () => {
            fallbackCalls += 1;
          },
        }),
      /bridge failed/,
    );

    assert.equal(fallbackCalls, 0);
  });

  it("throws when host bridge exists but export path is missing", async () => {
    let fallbackCalls = 0;
    setHostWindow({
      tuttiExternal: {
        files: {
          open: async () => undefined,
        },
      },
    });

    await assert.rejects(
      () =>
        openExportLocation({
          path: "   ",
          openExportsDir: async () => {
            fallbackCalls += 1;
          },
        }),
      /Export path is unavailable/,
    );

    assert.equal(fallbackCalls, 0);
  });
});
