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

/**
 * 모달/다이얼로그 공용 키보드 처리 훅.
 *
 * - 반환한 ref 를 `role="dialog"` 요소에 연결하면 열릴 때 해당 영역으로 포커스가 이동해
 *   키보드/스크린리더 사용자가 곧바로 모달 안에서 조작할 수 있다.
 * - 반환한 onKeyDown 을 같은 요소에 연결하면 Esc 로 닫을 수 있다. 이벤트는
 *   요소 단위(버블링)로 처리하고 stopPropagation 하므로, 모달이 중첩돼도 가장 안쪽
 *   모달만 닫힌다(문서 전역 리스너가 아니라서 서로 간섭하지 않는다).
 */
export const useDialogDismiss = <T extends HTMLElement = HTMLElement>({
  onDismiss,
  autoFocus = true,
  isOpen = true
}: UseDialogDismissOptions) => {
  const dialogRef = useRef<T | null>(null);

  useEffect(() => {
    if (!autoFocus || !isOpen) {
      return;
    }

    const node = dialogRef.current;

    // 이미 모달 안의 요소(autoFocus 입력 등)가 포커스를 가지고 있으면 빼앗지 않는다.
    if (node && !node.contains(document.activeElement)) {
      node.focus({ preventScroll: true });
    }
  }, [autoFocus, isOpen]);

  const onKeyDown = (event: ReactKeyboardEvent<T>) => {
    if (event.key === "Escape" && onDismiss) {
      event.stopPropagation();
      onDismiss();
    }
  };

  return { dialogRef, onKeyDown };
};
