import { useEffect, useRef, useState, type DragEvent } from "react";

interface DragAutoScrollSnapshot {
  clientX: number;
  clientY: number;
  target: EventTarget | null;
}

const DRAG_AUTO_SCROLL_EDGE_SIZE = 72;
const DRAG_AUTO_SCROLL_STEP = 22;

const resolveAutoScrollDelta = (pointer: number, start: number, end: number) => {
  if (pointer < start + DRAG_AUTO_SCROLL_EDGE_SIZE) {
    return -Math.min(
      Math.ceil((start + DRAG_AUTO_SCROLL_EDGE_SIZE - pointer) / 4),
      DRAG_AUTO_SCROLL_STEP
    );
  }

  if (pointer > end - DRAG_AUTO_SCROLL_EDGE_SIZE) {
    return Math.min(
      Math.ceil((pointer - (end - DRAG_AUTO_SCROLL_EDGE_SIZE)) / 4),
      DRAG_AUTO_SCROLL_STEP
    );
  }

  return 0;
};

const scrollDragContainer = (element: HTMLElement, snapshot: DragAutoScrollSnapshot) => {
  const rect = element.getBoundingClientRect();
  const deltaY = resolveAutoScrollDelta(snapshot.clientY, rect.top, rect.bottom);
  const deltaX = resolveAutoScrollDelta(snapshot.clientX, rect.left, rect.right);

  if (deltaY !== 0 && element.scrollHeight > element.clientHeight) {
    element.scrollTop += deltaY;
  }

  if (deltaX !== 0 && element.scrollWidth > element.clientWidth) {
    element.scrollLeft += deltaX;
  }
};

const findScrollableDragContainer = (target: EventTarget | null) => {
  let current = target instanceof HTMLElement ? target : null;

  while (current) {
    const styles = window.getComputedStyle(current);
    const overflowY = `${styles.overflowY} ${styles.overflow}`;
    const overflowX = `${styles.overflowX} ${styles.overflow}`;
    const canScrollY = /(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight;
    const canScrollX = /(auto|scroll)/.test(overflowX) && current.scrollWidth > current.clientWidth;

    if (canScrollY || canScrollX) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
};

export const useSiteManagementAssignmentDragState = () => {
  const [draggingEmployeeId, setDraggingEmployeeId] = useState<string | null>(null);
  const [draggingEmployeeSourceTeam, setDraggingEmployeeSourceTeam] = useState<string | null>(null);
  const dragAutoScrollFrameRef = useRef<number | null>(null);
  const dragAutoScrollSnapshotRef = useRef<DragAutoScrollSnapshot | null>(null);

  const stopDragAutoScroll = () => {
    if (dragAutoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      dragAutoScrollFrameRef.current = null;
    }

    dragAutoScrollSnapshotRef.current = null;
  };

  const runDragAutoScroll = () => {
    const snapshot = dragAutoScrollSnapshotRef.current;

    if (!snapshot) {
      dragAutoScrollFrameRef.current = null;
      return;
    }

    const nearestScrollable = findScrollableDragContainer(snapshot.target);

    if (nearestScrollable) {
      scrollDragContainer(nearestScrollable, snapshot);
    }

    const consoleMain = document.querySelector(".console-main");

    if (consoleMain instanceof HTMLElement && consoleMain !== nearestScrollable) {
      scrollDragContainer(consoleMain, snapshot);
    }

    const windowDeltaY = resolveAutoScrollDelta(snapshot.clientY, 0, window.innerHeight);
    const windowDeltaX = resolveAutoScrollDelta(snapshot.clientX, 0, window.innerWidth);

    if (windowDeltaX !== 0 || windowDeltaY !== 0) {
      window.scrollBy({
        left: windowDeltaX,
        top: windowDeltaY,
        behavior: "auto"
      });
    }

    dragAutoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
  };

  const queueDragAutoScroll = (snapshot: DragAutoScrollSnapshot) => {
    dragAutoScrollSnapshotRef.current = snapshot;

    if (dragAutoScrollFrameRef.current !== null) {
      return;
    }

    dragAutoScrollFrameRef.current = window.requestAnimationFrame(runDragAutoScroll);
  };

  const clearDraggingEmployee = () => {
    stopDragAutoScroll();
    setDraggingEmployeeId(null);
    setDraggingEmployeeSourceTeam(null);
  };

  const handleAssignmentDragAutoScroll = (event: DragEvent<HTMLElement>) => {
    if (!draggingEmployeeId) {
      return;
    }

    queueDragAutoScroll({
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target
    });
  };

  const handleStepTwoDragStart = (employeeId: string, sourceTeam: string | null) => {
    setDraggingEmployeeId(employeeId);
    setDraggingEmployeeSourceTeam(sourceTeam);
  };

  useEffect(() => {
    if (!draggingEmployeeId) {
      stopDragAutoScroll();
    }
  }, [draggingEmployeeId]);

  useEffect(
    () => () => {
      if (dragAutoScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragAutoScrollFrameRef.current);
      }
    },
    []
  );

  return {
    clearDraggingEmployee,
    draggingEmployeeId,
    draggingEmployeeSourceTeam,
    handleAssignmentDragAutoScroll,
    handleStepTwoDragStart,
    stopDragAutoScroll
  };
};
