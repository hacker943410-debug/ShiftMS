import { useState } from "react";

export type SiteView = "list" | "step1" | "step2";
export type PoolScope = "all" | "unassigned" | "other-site";

export const useSiteManagementStepState = (createDateInputValue: () => string) => {
  const [assignmentStartDate, setAssignmentStartDate] = useState(() => createDateInputValue());
  const [draggingTeamLabel, setDraggingTeamLabel] = useState<string | null>(null);
  const [poolKeyword, setPoolKeyword] = useState("");
  const [poolScope, setPoolScope] = useState<PoolScope>("all");
  const [selectedPatternPresetSiteId, setSelectedPatternPresetSiteId] = useState("");
  const [showPatternPresetModal, setShowPatternPresetModal] = useState(false);
  const [simulationMonthIndex, setSimulationMonthIndex] = useState(0);
  const [view, setView] = useState<SiteView>("list");

  const closePatternPresetModal = () => {
    setShowPatternPresetModal(false);
  };

  const openPatternPresetModal = (initialSiteId: string) => {
    setSelectedPatternPresetSiteId(initialSiteId);
    setShowPatternPresetModal(true);
  };

  const resetRegistrationViewState = () => {
    setShowPatternPresetModal(false);
    setSelectedPatternPresetSiteId("");
    setSimulationMonthIndex(0);
    setDraggingTeamLabel(null);
  };

  return {
    assignmentStartDate,
    closePatternPresetModal,
    draggingTeamLabel,
    openPatternPresetModal,
    poolKeyword,
    poolScope,
    resetRegistrationViewState,
    selectedPatternPresetSiteId,
    setAssignmentStartDate,
    setDraggingTeamLabel,
    setPoolKeyword,
    setPoolScope,
    setSelectedPatternPresetSiteId,
    setShowPatternPresetModal,
    setSimulationMonthIndex,
    setView,
    showPatternPresetModal,
    simulationMonthIndex,
    view
  };
};
