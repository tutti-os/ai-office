import assert from "node:assert/strict";
import test from "node:test";
import { createDebouncedWorkspaceRefresh } from "./index.js";

test("debounced workspace refresh serializes a scheduled refresh and terminal flush", async () => {
  let active = 0;
  let maxActive = 0;
  let refreshes = 0;
  const refresh = createDebouncedWorkspaceRefresh(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    refreshes += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
  }, 0);

  refresh.schedule();
  await new Promise((resolve) => setTimeout(resolve, 1));
  await refresh.flush();

  assert.equal(maxActive, 1);
  assert.equal(refreshes, 2);
  refresh.dispose();
});

test("terminal flush consumes a pending debounce without leaving a timer", async () => {
  let refreshes = 0;
  const refresh = createDebouncedWorkspaceRefresh(async () => { refreshes += 1; }, 30);
  refresh.schedule();
  refresh.schedule();
  await refresh.flush();
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(refreshes, 1);
});

test("schedule during terminal flush is drained without a trailing timer", async () => {
  let active = 0;
  let maxActive = 0;
  let refreshes = 0;
  let announceFirstStarted!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    announceFirstStarted = resolve;
  });
  let releaseFirst!: () => void;
  const releaseFirstWork = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const refresh = createDebouncedWorkspaceRefresh(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    refreshes += 1;
    if (refreshes === 1) {
      announceFirstStarted();
      await releaseFirstWork;
    }
    active -= 1;
  }, 0);

  const flushing = refresh.flush();
  await firstStarted;
  refresh.schedule();
  releaseFirst();
  await flushing;
  const countAtFlush = refreshes;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(maxActive, 1);
  assert.equal(countAtFlush, 2);
  assert.equal(refreshes, countAtFlush);
});
