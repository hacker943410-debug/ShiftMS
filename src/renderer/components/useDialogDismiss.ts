import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

interface UseDialogDismissOptions {
  /**
   * Esc 키를 눌렀을 때 실행할 닫기 동작. 닫을 수 없는 모달(예: 필수 업데이트)에서는
   * undefined 를 넘기면 Esc 가 무시된다.
   */
  onDismiss?: () => void;
  /**
   * 모달이 열릴 때 모달 영역으로 포커스를 옮길지 여부. autoFocus 입력이 따로 있는
   * 모달에서는 false 로 두어 입력 포커스를 빼앗지 않는다. 기본값 true.
   */
  autoFocus?: boolean;
  /**
   * 모달이 열려 있는지 여부. 화면 안에서 조건부로 렌더되는 모달은 이 값이 true 로
   * 바뀔 때 포커스를 옮겨야 하므로 열림 상태를 넘긴다. 모달 컴포넌트 자체가
   * 마운트/언마운트되는 경우(기본값 true)에는 신경 쓰지 않아도 된다.
   */
  isOpen?: boolean;
}

// 포커스를 받을 수 있는 요소 선택자(비활성·숨김 input·tabindex=-1 제외).
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

const getFocusableElements = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

/**
 * 모달/다이얼로그 공용 키보드·포커스 처리 훅.
 *
 * - 반환한 ref 를 `role="dialog"` 요소에 연결하면 열릴 때 해당 영역으로 포커스가 이동하고,
 *   닫힐 때 모달을 열기 직전에 포커스가 있던 요소(여는 버튼 등)로 포커스가 되돌아간다.
 * - 반환한 onKeyDown 을 같은 요소에 연결하면 Esc 로 닫을 수 있고, Tab/Shift+Tab 으로
 *   포커스가 모달 밖으로 나가지 않도록 모달 안에서 순환한다(포커스 트랩).
 * - 이벤트는 요소 단위(버블링)로 처리하고 stopPropagation 하므로, 모달이 중첩돼도 가장
 *   안쪽 모달만 닫히고 트랩도 가장 안쪽에만 적용된다(문서 전역 리스너가 아니라 간섭이 없다).
 */
export const useDialogDismiss = <T extends HTMLElement = HTMLElement>({
  onDismiss,
  autoFocus = true,
  isOpen = true
}: UseDialogDismissOptions) => {
  const dialogRef = useRef<T | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const node = dialogRef.current;
    const activeElement = document.activeElement as HTMLElement | null;

    // 모달을 열기 직전 포커스(여는 버튼 등)를 기억해 두고, 닫힐 때 되돌린다.
    // 모달 안의 요소(autoFocus 입력 등)가 이미 포커스를 가진 경우는 기억하지 않는다.
    if (activeElement && (!node || !node.contains(activeElement))) {
      previousFocusRef.current = activeElement;
    }

    if (autoFocus && node && !node.contains(document.activeElement)) {
      node.focus({ preventScroll: true });
    }

    return () => {
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;

      // 모달을 열기 전 포커스 요소가 아직 화면에 있으면 그쪽으로 포커스를 되돌린다.
      if (previous && previous.isConnected && typeof previous.focus === "function") {
        previous.focus({ preventScroll: true });
      }
    };
  }, [autoFocus, isOpen]);

  const onKeyDown = (event: ReactKeyboardEvent<T>) => {
    if (event.key === "Escape") {
      if (onDismiss) {
        event.stopPropagation();
        onDismiss();
      }

      return;
    }

    if (event.key === "Tab") {
      const node = dialogRef.current;

      if (!node) {
        return;
      }

      const focusable = getFocusableElements(node);

      if (focusable.length === 0) {
        // 포커스 가능한 요소가 없으면 모달 영역 밖으로 나가지 않게 막는다.
        event.preventDefault();
        node.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || !node.contains(active)) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last || !node.contains(active)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }
  };

  return { dialogRef, onKeyDown };
};
