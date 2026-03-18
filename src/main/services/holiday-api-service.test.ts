import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchHolidayApiItems } from "./holiday-api-service";

describe("holiday-api-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should resolve Nager API urls and normalize holiday rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            date: "2026-03-01",
            localName: "삼일절"
          },
          {
            date: "2026-03-01",
            localName: "중복"
          },
          {
            date: "2026-05-05",
            name: "어린이날"
          }
        ]
      })
    );

    const items = await fetchHolidayApiItems({
      baseUrl: "https://date.nager.at/api/v3/PublicHolidays",
      year: 2026
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://date.nager.at/api/v3/PublicHolidays/2026/KR",
      expect.objectContaining({
        headers: {
          Accept: "application/json"
        }
      })
    );
    expect(items.map((item) => item.holidayDate)).toEqual(["2026-03-01", "2026-05-05"]);
    expect(items[0]?.name).toBe("삼일절");
  });
});
