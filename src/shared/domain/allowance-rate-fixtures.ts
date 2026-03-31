import type { AllowanceRateVersion } from "./model";
import { createAllowanceRateItems } from "./allowance-rate-matrix";

export const allowanceRateVersionFixtures: AllowanceRateVersion[] = [
  {
    id: "rate-2026-1",
    year: 2026,
    versionLabel: "2026.1",
    status: "retired",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-06-30",
    createdAt: "2026-01-01T00:00:00+09:00",
    updatedAt: "2026-06-30T00:00:00+09:00",
    items: createAllowanceRateItems("rate-2026-1")
  },
  {
    id: "rate-2026-2",
    year: 2026,
    versionLabel: "2026.2",
    status: "active",
    effectiveFrom: "2026-07-01",
    createdAt: "2026-07-01T00:00:00+09:00",
    updatedAt: "2026-07-01T00:00:00+09:00",
    items: createAllowanceRateItems("rate-2026-2")
  },
  {
    id: "rate-2027-1",
    year: 2027,
    versionLabel: "2027.1",
    status: "draft",
    effectiveFrom: "2027-01-01",
    createdAt: "2027-01-01T00:00:00+09:00",
    updatedAt: "2027-01-01T00:00:00+09:00",
    items: createAllowanceRateItems("rate-2027-1")
  }
];
