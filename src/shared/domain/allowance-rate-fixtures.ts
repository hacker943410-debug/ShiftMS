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
    changeReason: "상반기 기본 기준 등록",
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
    changeReason: "하반기 지급 기준 조정",
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
    changeReason: "차년도 요율 초안 준비",
    createdAt: "2027-01-01T00:00:00+09:00",
    updatedAt: "2027-01-01T00:00:00+09:00",
    items: createAllowanceRateItems("rate-2027-1")
  }
];
