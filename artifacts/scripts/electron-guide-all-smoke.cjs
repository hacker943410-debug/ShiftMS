const { spawnSync } = require("node:child_process");

const guideScripts = [
  "artifacts/scripts/electron-guide-batch2-smoke.cjs",
  "artifacts/scripts/electron-guide-batch3-smoke.cjs",
  "artifacts/scripts/electron-guide-batch4-smoke.cjs",
  "artifacts/scripts/electron-guide-batch5-smoke.cjs"
];

for (const scriptPath of guideScripts) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("SMOKE_OK guide-all");
