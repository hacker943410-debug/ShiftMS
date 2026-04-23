import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const {
  buildReleaseTag,
  parseReleaseManifestText,
  resolveReleasePublishContext
} = require("../../../scripts/lib/release-publish-helpers.cjs");

let tempRoot = "";

const createTempProject = () => {
  tempRoot = mkdtempSync(path.join(tmpdir(), "shiftmgmt-release-publish-"));
  mkdirSync(path.resolve(tempRoot, "docs"), { recursive: true });
  mkdirSync(path.resolve(tempRoot, "artifacts", "releases", "v0.4.4"), {
    recursive: true
  });
  return tempRoot;
};

describe("release-publish-helpers", () => {
  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = "";
    }
  });

  it("builds a release tag from a version", () => {
    expect(buildReleaseTag("0.4.4")).toBe("v0.4.4");
  });

  it("parses a valid release manifest", () => {
    expect(
      parseReleaseManifestText(
        JSON.stringify({
          version: "0.4.4",
          required: false,
          headline: "0.4.4 안정화 업데이트",
          notes: ["기능 보강"],
          requiresDbBackup: false,
          publishedAt: "2026-04-23T00:00:00.000Z"
        })
      )
    ).toEqual({
      version: "0.4.4",
      required: false,
      headline: "0.4.4 안정화 업데이트",
      notes: ["기능 보강"],
      requiresDbBackup: false,
      publishedAt: "2026-04-23T00:00:00.000Z"
    });
  });

  it("resolves the current release context from package/doc/manifest files", () => {
    const projectRoot = createTempProject();

    writeFileSync(
      path.resolve(projectRoot, "package.json"),
      JSON.stringify({ version: "0.4.4" }, null, 2),
      "utf8"
    );
    writeFileSync(path.resolve(projectRoot, "docs", "release-0.4.4.md"), "# release body\n", "utf8");
    writeFileSync(
      path.resolve(projectRoot, "artifacts", "releases", "v0.4.4", "RELEASE_MANIFEST.json"),
      JSON.stringify({
        version: "0.4.4",
        required: false,
        headline: "0.4.4 안정화 업데이트",
        notes: ["기능 보강"],
        requiresDbBackup: false,
        publishedAt: "2026-04-23T00:00:00.000Z"
      }),
      "utf8"
    );

    const context = resolveReleasePublishContext(projectRoot);

    expect(context.version).toBe("0.4.4");
    expect(context.tagName).toBe("v0.4.4");
    expect(context.releaseManifest.version).toBe("0.4.4");
    expect(context.releaseManifestAssetName).toBe("RELEASE_MANIFEST.json");
    expect(context.releaseBody).toContain("release body");
  });
});
