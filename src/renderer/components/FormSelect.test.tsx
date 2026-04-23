// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { FormSelect } from "./FormSelect";

const mountedRoots: Root[] = [];
const mountedContainers: HTMLDivElement[] = [];

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderFormSelect = async (value: string) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  mountedContainers.push(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(
      <FormSelect name="employmentType" value={value}>
        <option value="정규">정규</option>
        <option value="계약">계약</option>
      </FormSelect>
    );
  });

  return { container };
};

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();

    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
  }

  mountedContainers.splice(0).forEach((container) => {
    container.remove();
  });
});

describe("FormSelect", () => {
  it("does not display the first option when the controlled value is unmatched", async () => {
    const { container } = await renderFormSelect("미분류");

    expect(container.querySelector(".app-select-value")?.textContent).toBe("미분류");
    expect(container.querySelector<HTMLInputElement>('input[name="employmentType"]')?.value).toBe(
      "미분류"
    );
  });

  it("shows a placeholder when there is no selected value and no empty option", async () => {
    const { container } = await renderFormSelect("");

    expect(container.querySelector(".app-select-value")?.textContent).toBe("선택");
    expect(container.querySelector<HTMLInputElement>('input[name="employmentType"]')?.value).toBe(
      ""
    );
  });
});
