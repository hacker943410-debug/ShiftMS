import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  resolveBundledSeedDocumentTemplatePath,
  resolveDocumentTemplateSourcePath
} from "./document-template-source-path-service";

describe("document-template-source-path-service", () => {
  it("should resolve bundled seed template paths from the workspace sample directory", () => {
    const resolvedPath = resolveBundledSeedDocumentTemplatePath("근무표_템플릿1.xlsx");

    expect(existsSync(resolvedPath)).toBe(true);
    expect(resolvedPath).toContain("근무표_템플릿1.xlsx");
  });

  it("should fall back to the bundled default template when a seeded template path is stale", () => {
    const resolvedPath = resolveDocumentTemplateSourcePath({
      id: "template-schedule-sample1-2026-1",
      sourcePath: "C:/missing/templates/근무표_템플릿1.xlsx"
    });

    expect(existsSync(resolvedPath)).toBe(true);
    expect(resolvedPath).toContain("근무표_템플릿1.xlsx");
  });

  it("should preserve missing custom template paths without falling back to bundled defaults", () => {
    expect(
      resolveDocumentTemplateSourcePath({
        id: "template-custom-schedule",
        sourcePath: "C:/missing/templates/custom-template.xlsx"
      })
    ).toBe("C:/missing/templates/custom-template.xlsx");
  });
});
