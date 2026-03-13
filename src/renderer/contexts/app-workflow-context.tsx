import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";

import type { RouteKey } from "../mock-design-data";

interface AppWorkflowState {
  activeRoute: RouteKey;
  selectedSiteId: string;
  selectedMonth: string;
}

interface AppWorkflowContextValue extends AppWorkflowState {
  openRoute: (
    route: RouteKey,
    options?: Partial<Pick<AppWorkflowState, "selectedSiteId" | "selectedMonth">>
  ) => void;
  setActiveRoute: (route: RouteKey) => void;
  setSelectedMonth: (month: string) => void;
  setSelectedSiteId: (siteId: string) => void;
}

const STORAGE_KEY = "shiftmgmt.app-workflow.v1";

const createCurrentMonthValue = () => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const createDefaultWorkflowState = (): AppWorkflowState => ({
  activeRoute: "dashboard",
  selectedSiteId: "",
  selectedMonth: createCurrentMonthValue()
});

const isRouteKey = (value: unknown): value is RouteKey =>
  value === "dashboard" ||
  value === "workforce" ||
  value === "sites" ||
  value === "schedule" ||
  value === "performance" ||
  value === "allowance" ||
  value === "operations";

const readStoredWorkflowState = (): AppWorkflowState => {
  if (typeof window === "undefined") {
    return createDefaultWorkflowState();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return createDefaultWorkflowState();
    }

    const parsed = JSON.parse(rawValue) as Partial<AppWorkflowState>;

    return {
      activeRoute: isRouteKey(parsed.activeRoute) ? parsed.activeRoute : "dashboard",
      selectedSiteId:
        typeof parsed.selectedSiteId === "string" ? parsed.selectedSiteId : "",
      selectedMonth:
        typeof parsed.selectedMonth === "string" && /^\d{4}-\d{2}$/.test(parsed.selectedMonth)
          ? parsed.selectedMonth
          : createCurrentMonthValue()
    };
  } catch {
    return createDefaultWorkflowState();
  }
};

const AppWorkflowContext = createContext<AppWorkflowContextValue | null>(null);

export const AppWorkflowProvider = ({ children }: PropsWithChildren) => {
  const [state, setState] = useState<AppWorkflowState>(() => readStoredWorkflowState());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setActiveRoute = useCallback((activeRoute: RouteKey) => {
    setState((current) =>
      current.activeRoute === activeRoute ? current : { ...current, activeRoute }
    );
  }, []);

  const setSelectedSiteId = useCallback((selectedSiteId: string) => {
    setState((current) =>
      current.selectedSiteId === selectedSiteId ? current : { ...current, selectedSiteId }
    );
  }, []);

  const setSelectedMonth = useCallback((selectedMonth: string) => {
    setState((current) =>
      current.selectedMonth === selectedMonth ? current : { ...current, selectedMonth }
    );
  }, []);

  const openRoute = useCallback(
    (
      activeRoute: RouteKey,
      options?: Partial<Pick<AppWorkflowState, "selectedSiteId" | "selectedMonth">>
    ) => {
      setState((current) => {
        const nextState = {
          ...current,
          activeRoute,
          selectedSiteId: options?.selectedSiteId ?? current.selectedSiteId,
          selectedMonth: options?.selectedMonth ?? current.selectedMonth
        };

        return current.activeRoute === nextState.activeRoute &&
          current.selectedSiteId === nextState.selectedSiteId &&
          current.selectedMonth === nextState.selectedMonth
          ? current
          : nextState;
      });
    },
    []
  );

  const value = useMemo<AppWorkflowContextValue>(
    () => ({
      ...state,
      setActiveRoute,
      setSelectedSiteId,
      setSelectedMonth,
      openRoute
    }),
    [openRoute, setActiveRoute, setSelectedMonth, setSelectedSiteId, state]
  );

  return <AppWorkflowContext.Provider value={value}>{children}</AppWorkflowContext.Provider>;
};

export const useAppWorkflow = () => {
  const context = useContext(AppWorkflowContext);

  if (!context) {
    throw new Error("useAppWorkflow must be used inside AppWorkflowProvider.");
  }

  return context;
};
