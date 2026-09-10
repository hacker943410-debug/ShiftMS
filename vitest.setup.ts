import "@testing-library/jest-dom";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { afterEach } from "vitest";

// One real turn of the event loop after every test, and it is not decoration.
//
// A worker talks to the vitest process over an RPC whose calls reject after 60 seconds. The timer
// that rejects them can only fire when the worker's event loop is free, and a test that blocks it -
// spawnSync of powershell.exe, run a few dozen times by the installer suite - keeps it busy without
// ever being slow enough on its own to look like the problem. The block is CUMULATIVE: awaiting a
// synchronous test body yields microtasks, not a loop turn, so the reply to an onTaskUpdate sent
// early in a file can sit unread across many short tests until its own timeout fires.
//
// The result was a suite where every test passed and the process still exited 1, which stops
// `npm run test && ...` - that is, release:package and release:publish - on a green run. It came
// and went with machine load, because load is what turns a 2-second spawn into a 12-second one.
//
// Measured on this host with eight sync tests of ten seconds each: without this hook, 8 passed and
// exit 1 with `[vitest-worker]: Timeout calling "onTaskUpdate"`; with it, 8 passed and exit 0.
//
// setImmediate is taken from node:timers/promises rather than the global on purpose - seven test
// files here install fake timers, and a hook that awaited a faked global would never come back.
afterEach(async () => {
  await yieldToEventLoop();
});
