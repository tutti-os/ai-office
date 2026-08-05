import assert from "node:assert/strict";
import test from "node:test";

import { buildOfficeCliEnv } from "./index.js";

test("buildOfficeCliEnv uses the platform path delimiter", () => {
  assert.deepEqual(
    buildOfficeCliEnv(
      "C:/Program Files/OfficeCLI/officecli.exe",
      "C:\\Windows",
      ";",
    ),
    {
      OFFICECLI: "C:/Program Files/OfficeCLI/officecli.exe",
      OFFICECLI_NO_AUTO_RESIDENT: "1",
      PATH: "C:/Program Files/OfficeCLI;C:\\Windows",
    },
  );
});
