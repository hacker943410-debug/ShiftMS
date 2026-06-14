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

// One numbered "이렇게 하시면 됩니다" step in a guidance modal.
export interface GuidanceStep {
  title: string;
  description: string;
}

// The button that walks the user to the screen where they can fix the problem.
export interface GuidanceNavigation {
  label: string;
  route: RouteKey;
  params?: Partial<Pick<AppWorkflowState, "selectedSiteId" | "selectedMonth">>;
}

// A friendly "왜 막혔는지 + 어떻게 하면 되는지" guide shown instead of a bare error/disabled state.
export interface GuidanceConfig {
  title: string;
  why: string;
  steps: GuidanceStep[];
  notes?: string[];
  navigation?: GuidanceNavigation;
}

interface AppWorkflowContextValue extends AppWorkflowState {
  openRoute: (
    route: RouteKey,
    options?: Partial<Pick<AppWorkflowState, "selectedSiteId" | "selectedMonth">>
  ) => void;
  setActiveRoute: (route: RouteKey) => void;
  setSelectedMonth: (month: string) => void;
  setSelectedSiteId: (siteId: string) => void;
  guidance: GuidanceConfig | null;
  showGuidance: (config: GuidanceConfig) => void;
  dismissGuidance: () => void;
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
  value === "operations" ||
  value === "access-history";

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
  const [guidance, setGuidance] = useState<GuidanceConfig | null>(null);

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

  const showGuidance = useCallback((config: GuidanceConfig) => {
    setGuidance(config);
  }, []);

  const dismissGuidance = useCallback(() => {
    setGuidance(null);
  }, []);

  const value = useMemo<AppWorkflowContextValue>(
    () => ({
      ...state,
      setActiveRoute,
      setSelectedSiteId,
      setSelectedMonth,
      openRoute,
      guidance,
      showGuidance,
      dismissGuidance
    }),
    [
      openRoute,
      setActiveRoute,
      setSelectedMonth,
      setSelectedSiteId,
      state,
      guidance,
      showGuidance,
      dismissGuidance
    ]
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
