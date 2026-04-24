import { describe, expect, it } from "vitest";

import {
  listReleaseHistory,
  listReleaseNotesBetweenVersions,
  parseReleaseManifest
} from "./release-history-service";

describe("release-history-service", () => {
  it("parses the extended release manifest shape", () => {
    const parsed = parseReleaseManifest({
      version: "0.4.6",
      required: false,
      headline: "0.4.6 패치노트",
      summary: "요약",
      notes: ["핵심 변경"],
      sections: [
        {
          title: "표기 방식",
          description: "설명",
          items: [{ title: "번호 목록", detail: "순서대로 표시" }],
          tables: [
            {
              title: "비교표",
              columns: ["구분", "변경"],
              rows: [["패치노트", "개선"]]
            }
          ]
        }
      ],
      requiresDbBackup: false,
      publishedAt: "2026-04-24T00:00:00.000Z"
    });

    expect(parsed?.summary).toBe("요약");
    expect(parsed?.sections?.[0]?.items?.[0]?.title).toBe("번호 목록");
    expect(parsed?.sections?.[0]?.tables?.[0]?.columns).toEqual(["구분", "변경"]);
  });

  it("finds release history with normalized keyword search", () => {
    const records = listReleaseHistory({
      keyword: "패치 확인범위",
      requiredFilter: "all",
      backupFilter: "all"
    });

    expect(records.some((record) => record.version === "0.4.6")).toBe(true);
  });

  it("returns every unseen release note between two versions in ascending order", () => {
    const manifests = listReleaseNotesBetweenVersions({
      currentVersion: "0.4.6",
      lastSeenVersion: "0.4.4"
    });

    expect(manifests.map((manifest) => manifest.version)).toEqual(["0.4.5", "0.4.6"]);
  });
});
