import { useEffect, useState } from "react";

import type { LocalFileSelection, SitePatternImportAnalysis } from "@shared/bridge/contracts";

import type { SiteViewRow } from "./site-management-selectors";

type PatternImportPreviewTab = "analysis" | "groups" | "mismatches" | "data";

export const useSiteManagementInteractionState = () => {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<SiteViewRow | null>(null);
  const [isAnalyzingPatternImport, setIsAnalyzingPatternImport] = useState(false);
  const [isDeletingSite, setIsDeletingSite] = useState(false);
  const [patternImportAnalysis, setPatternImportAnalysis] =
    useState<SitePatternImportAnalysis | null>(null);
  const [patternImportCopyStatus, setPatternImportCopyStatus] = useState<string | null>(null);
  const [patternImportError, setPatternImportError] = useState<string | null>(null);
  const [patternImportFile, setPatternImportFile] = useState<LocalFileSelection | null>(null);
  const [patternImportPreviewTab, setPatternImportPreviewTab] =
    useState<PatternImportPreviewTab>("analysis");
  const [showPatternImportGuide, setShowPatternImportGuide] = useState(false);
  const [showPatternImportModal, setShowPatternImportModal] = useState(false);

  useEffect(() => {
    setPatternImportPreviewTab("analysis");
    setPatternImportCopyStatus(null);
  }, [patternImportAnalysis]);

  return {
    deleteError,
    detailSiteId,
    detailSnapshot,
    isAnalyzingPatternImport,
    isDeletingSite,
    patternImportAnalysis,
    patternImportCopyStatus,
    patternImportError,
    patternImportFile,
    patternImportPreviewTab,
    setDeleteError,
    setDetailSiteId,
    setDetailSnapshot,
    setIsAnalyzingPatternImport,
    setIsDeletingSite,
    setPatternImportAnalysis,
    setPatternImportCopyStatus,
    setPatternImportError,
    setPatternImportFile,
    setPatternImportPreviewTab,
    setShowPatternImportGuide,
    setShowPatternImportModal,
    showPatternImportGuide,
    showPatternImportModal
  };
};
