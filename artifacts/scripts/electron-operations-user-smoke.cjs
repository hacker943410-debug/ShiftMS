const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const { defaultAdminAuth, ensureAuthenticated } = require("./electron-auth-helpers.cjs");

const uniqueSuffix = Date.now();
const uniqueLoginId = `smoke-user-${uniqueSuffix}`;
const plannerLoginId = `planner-smoke-${uniqueSuffix}`;
const reviewerLoginId = `reviewer-smoke-${uniqueSuffix}`;

const smokeUserPassword = "smokePass123!";
const plannerPassword = "plannerPass123!";
const plannerChangedPassword = "PlannerChanged123!";
const reviewerPassword = "reviewPass123!";
const reviewerChangedPassword = "ReviewerChanged123!";

const roleLabelByKey = {
  admin: "관리자",
  planner: "계획 담당",
  reviewer: "확인 담당",
  operator: "사용자"
};

const operatorVisibleRoutes = [
  "대시보드",
  "인력 관리",
  "근무지 관리",
  "근무표 배포",
  "실적 관리",
  "수당 관리"
];
const adminOnlyRoutes = ["운영 관리", "활동 이력"];

const waitForRouteTitle = async (page, title) => {
  await page.waitForFunction(
    (expectedTitle) => {
      const heading = document.querySelector(".top-strip-title h2");
      return typeof heading?.textContent === "string" && heading.textContent.includes(expectedTitle);
    },
    title,
    { timeout: 60000 }
  );
};

const openRoute = async (page, routeLabel) => {
  await page.locator(".route-list .route-button").filter({ hasText: routeLabel }).first().click();
  await waitForRouteTitle(page, routeLabel);
};

const signOut = async (page) => {
  await page.locator(".profile-summary-button").click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.waitForFunction(
    () => Boolean(document.querySelector(".login-layout .login-form")),
    undefined,
    { timeout: 60000 }
  );
};

const assertRouteVisibility = async (page, input) => {
  await page.waitForFunction(
    ({ visible, hidden }) => {
      const routeTexts = [...document.querySelectorAll(".route-list .route-button")].map(
        (button) => button.textContent ?? ""
      );

      return (
        visible.every((label) => routeTexts.some((text) => text.includes(label))) &&
        hidden.every((label) => routeTexts.every((text) => !text.includes(label)))
      );
    },
    input,
    { timeout: 60000 }
  );
};

// 저장·삭제가 끝나면 "완료" 안내 창이 뜨고, 닫기 전까지 목록의 수정/삭제 버튼이 잠긴다.
const dismissActionResultDialogs = async (page) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const overlay = page.locator(".question-dialog-overlay");

    if ((await overlay.count()) === 0) {
      return;
    }

    await overlay
      .last()
      .locator(".question-dialog-actions button")
      .last()
      .click({ timeout: 5000 })
      .catch(() => null);
    await page.waitForTimeout(200);
  }
};

const createUser = async (page, input) => {
  await page.getByRole("button", { name: "신규 사용자 추가", exact: true }).click();

  const modal = page.locator(".operations-edit-modal");
  await modal.locator("label:has-text('계정명') input").fill(input.loginId);
  await modal.locator("label:has-text('이름') input").fill(input.displayName);
  await modal.locator("label:has-text('권한') select").selectOption(input.role);
  await modal.getByRole("textbox", { name: "초기 비밀번호", exact: true }).fill(input.password);
  await modal
    .getByRole("textbox", { name: "초기 비밀번호 확인", exact: true })
    .fill(input.password);
  await modal.locator("label:has-text('연락처') input").fill(input.contact);
  await modal.locator("label:has-text('메일주소') input").fill(input.email);
  await modal.getByRole("button", { name: "등록", exact: true }).click();

  await page.waitForFunction(
    ({ loginId, roleLabel }) => {
      const rows = [...document.querySelectorAll("table tbody tr")];
      return rows.some(
        (row) =>
          row.textContent?.includes(loginId) &&
          row.textContent?.includes(roleLabel) &&
          row.textContent?.includes("사용중")
      );
    },
    {
      loginId: input.loginId,
      roleLabel: roleLabelByKey[input.role]
    },
    { timeout: 60000 }
  );

  await dismissActionResultDialogs(page);
};

const updateAndDeleteCrudUser = async (page, loginId) => {
  const userRow = page.locator("table tbody tr").filter({ hasText: loginId }).first();

  await userRow.getByRole("button", { name: "수정", exact: true }).click();
  await page.locator("label:has-text('연락처') input").fill("010-1111-9999");
  await page.locator("label:has-text('상태') select").selectOption("inactive");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await dismissActionResultDialogs(page);

  await page.waitForFunction(
    (targetLoginId) => {
      const rows = [...document.querySelectorAll("table tbody tr")];
      return rows.some(
        (row) =>
          row.textContent?.includes(targetLoginId) &&
          row.textContent?.includes("010-1111-9999") &&
          row.textContent?.includes("중지")
      );
    },
    loginId,
    { timeout: 60000 }
  );

  await userRow.getByRole("button", { name: "삭제", exact: true }).click();
  await page.locator(".question-dialog-overlay").getByRole("button", { name: "삭제", exact: true }).click();
  await dismissActionResultDialogs(page);

  await page.waitForFunction(
    (targetLoginId) => {
      const rows = [...document.querySelectorAll("table tbody tr")];
      return rows.every((row) => !row.textContent?.includes(targetLoginId));
    },
    loginId,
    { timeout: 60000 }
  );
};

const verifyPlannerRoleAccess = async (page) => {
  await waitForRouteTitle(page, "대시보드");
  await assertRouteVisibility(page, {
    visible: operatorVisibleRoutes,
    hidden: adminOnlyRoutes
  });

  await openRoute(page, "근무표 배포");
  await page.locator(".schedule-filter-actions .primary-button").waitFor({
    state: "visible",
    timeout: 60000
  });
  if (
    (await page
      .locator(".schedule-filter-actions .site-field-note", {
        hasText: "배포 권한 필요"
      })
      .count()) > 0
  ) {
    throw new Error("planner should see deploy action, but schedule screen rendered the forbidden note");
  }

  await openRoute(page, "실적 관리");
  await page.waitForSelector(".performance-filter-icon-button[aria-label='새로고침']", {
    timeout: 60000
  });
  if ((await page.locator(".performance-filter-icon-button[aria-label='일괄 승인']").count()) > 0) {
    throw new Error("planner should not see the performance batch approval button");
  }
};

const verifyReviewerRoleAccess = async (page) => {
  await assertRouteVisibility(page, {
    visible: operatorVisibleRoutes,
    hidden: adminOnlyRoutes
  });

  await openRoute(page, "근무표 배포");
  await page
    .locator(".schedule-filter-actions .site-field-note", {
      hasText: "배포 권한 필요"
    })
    .waitFor({
      state: "visible",
      timeout: 60000
    });
  if ((await page.locator(".schedule-filter-actions .primary-button").count()) > 0) {
    throw new Error("reviewer should not see the schedule deploy button");
  }

  await openRoute(page, "실적 관리");
  await page.waitForSelector(".performance-filter-icon-button[aria-label='일괄 승인']", {
    timeout: 60000
  });
};

(async () => {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shiftmgmt-operations-user-smoke-"));

  const app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: tempDataDir,
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: defaultAdminAuth.currentPassword
    }
  });
  const page = await app.firstWindow();

  try {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    page.on("dialog", (dialog) => dialog.accept());

    await ensureAuthenticated(page, defaultAdminAuth);

    await openRoute(page, "운영 관리");
    await page.getByRole("tab", { name: /사용자 관리/ }).click();
    await page.waitForSelector("h3:has-text('권한 및 상태별 사용자 목록')", { timeout: 60000 });

    await createUser(page, {
      loginId: uniqueLoginId,
      displayName: "스모크 사용자",
      role: "operator",
      password: smokeUserPassword,
      contact: "010-5555-7777",
      email: "smoke-user@company.local"
    });
    await updateAndDeleteCrudUser(page, uniqueLoginId);

    await createUser(page, {
      loginId: plannerLoginId,
      displayName: "스모크 계획 담당",
      role: "planner",
      password: plannerPassword,
      contact: "010-2222-3333",
      email: "planner-smoke@company.local"
    });

    await createUser(page, {
      loginId: reviewerLoginId,
      displayName: "스모크 확인 담당",
      role: "reviewer",
      password: reviewerPassword,
      contact: "010-4444-5555",
      email: "reviewer-smoke@company.local"
    });

    await signOut(page);

    await ensureAuthenticated(page, {
      loginId: plannerLoginId,
      currentPassword: plannerPassword,
      nextPassword: plannerChangedPassword
    });
    await verifyPlannerRoleAccess(page);

    await signOut(page);

    await ensureAuthenticated(page, {
      loginId: reviewerLoginId,
      currentPassword: reviewerPassword,
      nextPassword: reviewerChangedPassword
    });
    await verifyReviewerRoleAccess(page);

    console.log(
      `SMOKE_OK createdAndDeleted=${uniqueLoginId} planner=${plannerLoginId} reviewer=${reviewerLoginId}`
    );
  } finally {
    await app.close();
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
