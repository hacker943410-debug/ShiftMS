const fs = require("node:fs");
const path = require("node:path");

const ensureAuthenticated = async (page) => {
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button")];
    return buttons.some((button) => {
      const text = button.textContent ?? "";
      return text.includes("로그인") || text.includes("대시보드");
    });
  }, undefined, { timeout: 60000 });

  const dashboardButton = page.getByRole("button", { name: /대시보드/ });

  if ((await dashboardButton.count()) > 0) {
    return;
  }

  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.waitForSelector("button:has-text('대시보드')", { timeout: 60000 });
};

const openRouteMenu = async (page, menuName) => {
  await page.getByRole("button", { name: new RegExp(menuName) }).click();
  await page.waitForFunction(
    (label) => {
      const title = document.querySelector(".top-strip-title h2");
      return typeof title?.textContent === "string" && title.textContent.includes(label);
    },
    menuName,
    { timeout: 60000 }
  );
};

const waitForGuideTitle = async (page, guideTitle) => {
  await page.waitForSelector(".guide-flow-modal", { state: "visible", timeout: 60000 });
  await page.waitForFunction(
    (titleText) => {
      const title = document.querySelector(".guide-flow-kicker");
      return typeof title?.textContent === "string" && title.textContent.includes(titleText);
    },
    guideTitle,
    { timeout: 60000 }
  );
};

const closeGuide = async (page) => {
  const topCloseButton = page.getByRole("button", { name: "가이드 닫기" });

  if ((await topCloseButton.count()) > 0) {
    await topCloseButton.click();
  } else {
    await page.getByRole("button", { name: "닫기", exact: true }).click();
  }

  await page.waitForSelector(".guide-flow-modal", { state: "detached", timeout: 60000 });
};

const cleanupGuideScreenshots = (prefixes) => {
  const screenshotDir = path.join(process.cwd(), "artifacts", "screenshots");

  if (!fs.existsSync(screenshotDir)) {
    return;
  }

  const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
  const fileNames = fs.readdirSync(screenshotDir);

  for (const fileName of fileNames) {
    if (!fileName.endsWith(".png") || fileName.endsWith("-manual.png")) {
      continue;
    }

    const matchedPrefix = prefixList.find((prefix) => fileName.startsWith(prefix));

    if (!matchedPrefix) {
      continue;
    }

    fs.rmSync(path.join(screenshotDir, fileName), { force: true });
  }
};

const assertGuideTabSwitch = async (page, contextLabel) => {
  const flowTab = page.getByRole("tab", { name: "사용 흐름", exact: true });
  const detailTab = page.getByRole("tab", { name: "기능 설명", exact: true });

  await flowTab.waitFor({ state: "visible", timeout: 60000 });
  await detailTab.waitFor({ state: "visible", timeout: 60000 });

  const waitForTabState = async (label, selected) => {
    await page.waitForFunction(
      ({ label: tabLabel, selected: selectedState }) => {
        const tabs = [...document.querySelectorAll(".guide-flow-panel-tab[role='tab']")];
        const target = tabs.find((tab) => {
          return typeof tab.textContent === "string" && tab.textContent.includes(tabLabel);
        });

        return target instanceof HTMLElement
          ? target.getAttribute("aria-selected") === String(selectedState)
          : false;
      },
      { label, selected },
      { timeout: 60000 }
    );
  };

  const waitForSummaryLabel = async (summaryLabel) => {
    await page.waitForFunction(
      (label) => {
        const summary = document.querySelector(".guide-flow-panel-summary strong");
        return typeof summary?.textContent === "string" && summary.textContent.includes(label);
      },
      summaryLabel,
      { timeout: 60000 }
    );
  };

  await waitForTabState("사용 흐름", true);
  await waitForTabState("기능 설명", false);
  await page.waitForSelector(".guide-flow-inline-tip", { state: "visible", timeout: 60000 });
  await waitForSummaryLabel("사용 흐름");

  await detailTab.click();
  await waitForTabState("기능 설명", true);
  await waitForTabState("사용 흐름", false);
  await waitForSummaryLabel("기능 설명");
  await page.waitForSelector(".guide-flow-support-stack", { state: "visible", timeout: 60000 });
  await page.waitForSelector(".guide-flow-inline-tip", { state: "detached", timeout: 60000 });
  await page.waitForFunction(
    () => {
      const steps = [...document.querySelectorAll(".guide-flow-step-button")];
      return steps.length > 0 && steps.some((step) => step.classList.contains("is-active"));
    },
    undefined,
    { timeout: 60000 }
  );

  await flowTab.click();
  await waitForTabState("사용 흐름", true);
  await waitForTabState("기능 설명", false);
  await waitForSummaryLabel("사용 흐름");
  await page.waitForSelector(".guide-flow-inline-tip", { state: "visible", timeout: 60000 });
  await page.waitForSelector(".guide-flow-support-stack", { state: "detached", timeout: 60000 });
  await page.waitForFunction(
    () => {
      const steps = [...document.querySelectorAll(".guide-flow-step-button")];
      return steps.length > 0 && steps.some((step) => step.classList.contains("is-active"));
    },
    undefined,
    { timeout: 60000 }
  );

  const tabState = await page.evaluate(() => {
    return [...document.querySelectorAll(".guide-flow-panel-tab[role='tab']")].map((tab) => ({
      label: tab.textContent?.trim() ?? "",
      selected: tab.getAttribute("aria-selected")
    }));
  });

  const flowSelected = tabState.find((tab) => tab.label.includes("사용 흐름"))?.selected;
  const detailSelected = tabState.find((tab) => tab.label.includes("기능 설명"))?.selected;

  if (flowSelected !== "true" || detailSelected !== "false") {
    throw new Error(
      `[${contextLabel}] guide tab state did not return to flow mode: ${JSON.stringify(tabState)}`
    );
  }
};

const assertGuideFigureViewport = async (page, contextLabel) => {
  const result = await page.evaluate(() => {
    const shell = document.querySelector(".guide-flow-figure-shell");

    if (!(shell instanceof HTMLElement)) {
      return {
        ok: false,
        reason: "guide-flow-figure-shell not found"
      };
    }

    const shellRect = shell.getBoundingClientRect();
    const overlayNodes = [
      ...shell.querySelectorAll(
        ".guide-focus-highlight.is-active, .guide-scene-callout, .guide-motion-pointer, .guide-motion-ripple"
      )
    ]
      .filter((node) => node instanceof HTMLElement)
      .filter((node) => {
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      });

    const shellBounds = {
      left: shellRect.left,
      top: shellRect.top,
      right: shellRect.right,
      bottom: shellRect.bottom
    };

    const metrics = overlayNodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const intersectionWidth = Math.max(
        0,
        Math.min(rect.right, shellRect.right) - Math.max(rect.left, shellRect.left)
      );
      const intersectionHeight = Math.max(
        0,
        Math.min(rect.bottom, shellRect.bottom) - Math.max(rect.top, shellRect.top)
      );
      const area = rect.width * rect.height;
      const intersectionArea = intersectionWidth * intersectionHeight;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const className = node.className;
      const kind = className.includes("guide-motion-ripple")
        ? "ripple"
        : className.includes("guide-motion-pointer")
          ? "pointer"
          : className.includes("guide-focus-highlight")
            ? "highlight"
          : "callout";
      const minimumRatio =
        kind === "ripple" ? 0.18 : kind === "pointer" ? 0.3 : kind === "highlight" ? 0.4 : 0.42;
      const intersectionRatio = area > 0 ? intersectionArea / area : 0;
      const centerInside =
        centerX >= shellRect.left &&
        centerX <= shellRect.right &&
        centerY >= shellRect.top &&
        centerY <= shellRect.bottom;

      return {
        className,
        kind,
        rect: {
          left: Number(rect.left.toFixed(1)),
          top: Number(rect.top.toFixed(1)),
          right: Number(rect.right.toFixed(1)),
          bottom: Number(rect.bottom.toFixed(1))
        },
        centerInside,
        intersectionRatio: Number(intersectionRatio.toFixed(3)),
        minimumRatio
      };
    });

    const violations = metrics.filter(
      (metric) => !metric.centerInside || metric.intersectionRatio < metric.minimumRatio
    );

    return {
      ok: violations.length === 0,
      shellBounds,
      checkedCount: metrics.length,
      violations
    };
  });

  if (!result.ok) {
    const details = result.violations?.map((violation) => {
      return `${violation.kind}:${violation.className} rect=${JSON.stringify(violation.rect)} ratio=${violation.intersectionRatio}`;
    });
    throw new Error(
      `[${contextLabel}] guide overlay out of bounds (${result.checkedCount ?? 0} checked, shell=${JSON.stringify(result.shellBounds)}): ${details?.join(" | ") ?? result.reason}`
    );
  }
};

module.exports = {
  assertGuideTabSwitch,
  assertGuideFigureViewport,
  closeGuide,
  cleanupGuideScreenshots,
  ensureAuthenticated,
  openRouteMenu,
  waitForGuideTitle
};
