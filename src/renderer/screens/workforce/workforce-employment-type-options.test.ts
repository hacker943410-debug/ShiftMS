import { describe, expect, it } from "vitest";

import {
  isWorkforceEmploymentTypeOption,
  resolveWorkforceEmploymentTypeFormValue
} from "./workforce-employment-type-options";

describe("workforce employment type options", () => {
  it("keeps supported employment types", () => {
    expect(resolveWorkforceEmploymentTypeFormValue("정규")).toBe("정규");
    expect(resolveWorkforceEmploymentTypeFormValue("BP")).toBe("BP");
  });

  it("defaults blank or legacy unclassified values to regular employment", () => {
    expect(resolveWorkforceEmploymentTypeFormValue("")).toBe("정규");
    expect(resolveWorkforceEmploymentTypeFormValue("미분류")).toBe("정규");
  });

  it("detects supported option values only", () => {
    expect(isWorkforceEmploymentTypeOption("계약")).toBe(true);
    expect(isWorkforceEmploymentTypeOption("미분류")).toBe(false);
  });
});
