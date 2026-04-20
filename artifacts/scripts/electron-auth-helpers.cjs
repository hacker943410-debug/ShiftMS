const defaultAdminAuth = {
  loginId: "admin",
  currentPassword: "1234",
  nextPassword: "AdminChanged123!"
};

const detectStage = async (page) =>
  page.evaluate(() => {
    if (document.querySelector(".console-shell")) {
      return "dashboard";
    }

    const form = document.querySelector(".login-form");

    if (!(form instanceof HTMLFormElement)) {
      return "unknown";
    }

    const inputCount = form.querySelectorAll("input").length;
    const hasPasswordChangeButtons = Boolean(form.querySelector(".button-row"));
    const hasLoginLayout = Boolean(document.querySelector(".login-layout"));
    const hasLoginError = Boolean(form.querySelector(".error-copy"));
    const hasPasswordChangeError = Boolean(form.querySelector(".form-error-text"));

    if (hasPasswordChangeButtons && inputCount >= 3) {
      return hasPasswordChangeError ? "password-change-error" : "password-change";
    }

    if (hasLoginLayout && inputCount >= 2) {
      return hasLoginError ? "login-error" : "login";
    }

    return "unknown";
  });

const waitForStageChange = async (page, previousStage) => {
  await page.waitForFunction(
    (expectedPreviousStage) => {
      if (document.querySelector(".console-shell")) {
        return expectedPreviousStage !== "dashboard";
      }

      const form = document.querySelector(".login-form");

      if (!(form instanceof HTMLFormElement)) {
        return false;
      }

      const inputCount = form.querySelectorAll("input").length;
      const hasPasswordChangeButtons = Boolean(form.querySelector(".button-row"));

      if (hasPasswordChangeButtons && inputCount >= 3) {
        const hasPasswordChangeError = Boolean(form.querySelector(".form-error-text"));
        const nextStage = hasPasswordChangeError ? "password-change-error" : "password-change";
        return nextStage !== expectedPreviousStage;
      }

      if (document.querySelector(".login-layout") && inputCount >= 2) {
        const hasLoginError = Boolean(form.querySelector(".error-copy"));
        const nextStage = hasLoginError ? "login-error" : "login";
        return nextStage !== expectedPreviousStage;
      }

      return false;
    },
    previousStage,
    { timeout: 60000 }
  );

  return detectStage(page);
};

const submitLogin = async (page, loginId, password) => {
  const form = page.locator(".login-layout .login-form");
  const inputs = form.locator("input");
  const previousStage = await detectStage(page);

  await inputs.nth(0).fill(loginId);
  await inputs.nth(1).fill(password);
  await form.locator(".login-submit").click();

  return waitForStageChange(page, previousStage);
};

const submitPasswordChange = async (page, currentPassword, nextPassword) => {
  const form = page.locator(".login-panel .login-form");
  const inputs = form.locator("input");
  const previousStage = await detectStage(page);

  await inputs.nth(0).fill(currentPassword);
  await inputs.nth(1).fill(nextPassword);
  await inputs.nth(2).fill(nextPassword);
  await form.locator(".button-row .primary-button").click();

  return waitForStageChange(page, previousStage);
};

const waitForDashboard = async (page) => {
  await page.waitForFunction(
    () =>
      document.querySelectorAll(".route-list .route-button").length >= 1 &&
      document.querySelector(".top-strip-title h2"),
    undefined,
    { timeout: 60000 }
  );
};

const ensureAuthenticated = async (page, input) => {
  await page.waitForFunction(
    () => Boolean(document.querySelector(".login-form")) || Boolean(document.querySelector(".console-shell")),
    undefined,
    { timeout: 60000 }
  );

  let stage = await detectStage(page);

  if (stage === "dashboard") {
    await waitForDashboard(page);
    return;
  }

  if (stage === "login" || stage === "login-error") {
    stage = await submitLogin(page, input.loginId, input.currentPassword);
  }

  if (stage === "dashboard") {
    await waitForDashboard(page);
    return;
  }

  if (stage === "password-change" || stage === "password-change-error") {
    stage = await submitPasswordChange(page, input.currentPassword, input.nextPassword);
  }

  if (stage === "login" || stage === "login-error") {
    stage = await submitLogin(page, input.loginId, input.nextPassword);
  }

  if (stage !== "dashboard") {
    throw new Error(`authentication did not reach dashboard; loginId=${input.loginId}; finalStage=${stage}`);
  }

  await waitForDashboard(page);
};

module.exports = {
  defaultAdminAuth,
  ensureAuthenticated
};
