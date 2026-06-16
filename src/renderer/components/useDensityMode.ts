import { useCallback, useEffect, useState } from "react";

export type DensityMode = "comfortable" | "compact";

const STORAGE_KEY = "shiftmgmt.density-mode";
const COMPACT_BODY_CLASS = "density-compact";

const readStoredMode = (): DensityMode => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    // localStorage 를 쓸 수 없는 환경에서는 기본(여유) 보기로 동작한다.
    return "comfortable";
  }
};

/**
 * 표를 촘촘하게 보는 "고밀도(Dense)" 보기 상태를 관리하는 훅.
 *
 * - 선택값은 localStorage 에 저장돼 앱을 다시 열어도 유지된다.
 * - compact 일 때 document.body 에 `density-compact` 클래스를 붙여, 고밀도를 지원하는
 *   화면(실적·활동 이력 표)만 촘촘하게 바뀐다. 다른 화면은 영향을 받지 않는다.
 */
export const useDensityMode = () => {
  const [mode, setMode] = useState<DensityMode>(readStoredMode);

  useEffect(() => {
    document.body.classList.toggle(COMPACT_BODY_CLASS, mode === "compact");

    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // 저장 실패는 무시한다(보기 설정이 유지되지 않을 뿐 기능에는 영향 없음).
    }
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((current) => (current === "compact" ? "comfortable" : "compact"));
  }, []);

  return { mode, toggle };
};
