import { readFileSync } from "node:fs";
import path from "node:path";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";

import { describe, expect, it, vi } from "vitest";

// What vitest.setup.ts does after every test, and why it cannot be written any other way. Neither
// assertion here is about a feature of this app: they are about the release gate, which runs
// `npm run test && ...` and therefore stops on a process that exits 1 with every test green.
describe("the per-test event loop yield", () => {
  it("still comes back when a test has left fake timers installed", async () => {
    vi.useFakeTimers();

    try {
      // The hook awaits exactly this. A yield taken from the GLOBAL setTimeout or setImmediate is
      // faked here and never fires, which would hang the hook after all seven test files that
      // install fake timers - a cure worse than the exit code it was added for. Reaching the line
      // below at all is the assertion; if it did not, this test would fail on its own timeout.
      await yieldToEventLoop();

      expect(true).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("is registered for every test file, from a source fake timers do not touch", () => {
    const setup = readFileSync(path.resolve(process.cwd(), "vitest.setup.ts"), "utf8");

    // A text check, and said plainly: nothing here can observe the worker's RPC from inside a test,
    // so what is pinned is that the hook is still registered and still takes its yield from
    // node:timers/promises. The behaviour itself was measured by hand - eight ten-second sync tests
    // exit 1 without this hook and 0 with it - and that measurement is written into the setup file.
    expect(setup).toMatch(/from "node:timers\/promises"/);
    expect(setup).toMatch(/afterEach\(async \(\) => \{/);
    expect(setup).toMatch(/await yieldToEventLoop\(\);/);
  });
});
