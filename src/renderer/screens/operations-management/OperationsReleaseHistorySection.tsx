import { useEffect, useMemo, useState } from "react";

import type { ReleaseHistoryListQuery } from "@shared/bridge/contracts";
import type { ReleaseManifest } from "@shared/domain/app-update";

import { ReleaseManifestContent } from "../../components/ReleaseManifestContent";
import { FormSelect } from "../../components/FormSelect";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "패치이력을 불러오는 중 오류가 발생했습니다.";

const formatReleaseDate = (value: string) => {
  const target = new Date(value);

  if (Number.isNaN(target.getTime())) {
    return value;
  }

  return target.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
};

const buildPatchNoteTitle = (version: string) => `Patch Note ${version}`;

export const OperationsReleaseHistorySection = () => {
  const [records, setRecords] = useState<ReleaseManifest[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [requiredFilter, setRequiredFilter] =
    useState<ReleaseHistoryListQuery["requiredFilter"]>("all");
  const [backupFilter, setBackupFilter] =
    useState<ReleaseHistoryListQuery["backupFilter"]>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const query = useMemo<ReleaseHistoryListQuery>(
    () => ({
      keyword,
      requiredFilter,
      backupFilter
    }),
    [backupFilter, keyword, requiredFilter]
  );

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setScreenError(null);

      try {
        const result = await window.appBridge.listReleaseHistory(query);

        if (!active) {
          return;
        }

        if (!result.ok) {
          setRecords([]);
          setScreenError(result.message);
          return;
        }

        setRecords(result.data);
      } catch (error) {
        if (active) {
          setRecords([]);
          setScreenError(getErrorMessage(error));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [query, refreshKey]);

  const requiredCount = useMemo(
    () => records.filter((record) => record.required).length,
    [records]
  );
  const backupCount = useMemo(
    () => records.filter((record) => record.requiresDbBackup).length,
    [records]
  );
  const selectedRecord = useMemo(
    () => records.find((record) => record.version === selectedVersion) ?? null,
    [records, selectedVersion]
  );

  if (selectedRecord) {
    return (
      <div className="screen-stack release-history-screen">
        <section className="surface-card release-history-detail-card">
          <div className="section-heading compact-heading release-history-detail-heading">
            <div>
              <h3>{buildPatchNoteTitle(selectedRecord.version)}</h3>
              <p>{selectedRecord.headline}</p>
            </div>
            <button
              className="ghost-button compact-button"
              onClick={() => {
                setSelectedVersion(null);
              }}
              type="button"
            >
              목록으로
            </button>
          </div>

          <ReleaseManifestContent manifest={selectedRecord} />
        </section>
      </div>
    );
  }

  return (
    <div className="screen-stack release-history-screen">
      <section className="surface-card release-history-hero-card">
        <div className="section-heading compact-heading">
          <div>
            <h3>패치이력</h3>
            <p>배포된 버전별 변경사항을 같은 형식으로 확인하고, 키워드로 빠르게 찾을 수 있습니다.</p>
          </div>
          <div className="button-row">
            <span className="pill neutral">{records.length}건</span>
            <button
              className="ghost-button compact-button"
              onClick={() => {
                setRefreshKey((current) => current + 1);
              }}
              type="button"
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="operations-summary-strip">
          <article className="operations-summary-card">
            <span className="operations-summary-label">조회 결과</span>
            <strong>{records.length}건</strong>
            <small>조건에 맞는 버전 수</small>
          </article>
          <article className="operations-summary-card">
            <span className="operations-summary-label">필수 업데이트</span>
            <strong>{requiredCount}건</strong>
            <small>강제 적용 버전</small>
          </article>
          <article className="operations-summary-card">
            <span className="operations-summary-label">DB 백업 필요</span>
            <strong>{backupCount}건</strong>
            <small>적용 전 자동 백업 대상</small>
          </article>
        </div>

        <div className="filter-grid release-history-filter-grid">
          <label className="field filter-field release-history-filter-select">
            <span>업데이트 구분</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                setRequiredFilter(event.target.value as ReleaseHistoryListQuery["requiredFilter"]);
              }}
              selectClassName="top-filter-select"
              value={requiredFilter}
            >
              <option value="all">전체</option>
              <option value="required">필수 업데이트</option>
              <option value="optional">선택 업데이트</option>
            </FormSelect>
          </label>

          <label className="field filter-field release-history-filter-select">
            <span>적용 조건</span>
            <FormSelect
              className="top-filter-select-shell"
              onChange={(event) => {
                setBackupFilter(event.target.value as ReleaseHistoryListQuery["backupFilter"]);
              }}
              selectClassName="top-filter-select"
              value={backupFilter}
            >
              <option value="all">전체</option>
              <option value="required">DB 백업 후 적용</option>
              <option value="not-required">즉시 적용 가능</option>
            </FormSelect>
          </label>

          <label className="field filter-field release-history-filter-keyword">
            <span>검색</span>
            <input
              onChange={(event) => {
                setKeyword(event.target.value);
              }}
              placeholder="버전 / 제목 / 변경내용 / 표 내용"
              value={keyword}
            />
          </label>

          <button
            className="ghost-button release-history-reset-button"
            onClick={() => {
              setKeyword("");
              setRequiredFilter("all");
              setBackupFilter("all");
              setSelectedVersion(null);
              setRefreshKey((current) => current + 1);
            }}
            type="button"
          >
            초기화
          </button>
        </div>

        {screenError ? <p className="form-error-text">{screenError}</p> : null}
      </section>

      <section className="screen-stack">
        {isLoading ? (
          <section className="surface-card">
            <p className="app-update-copy">패치이력을 불러오는 중입니다.</p>
          </section>
        ) : records.length > 0 ? (
          <section className="surface-card release-history-board-card">
            <div className="data-scroll">
              <table className="info-table compact-table release-history-board-table">
                <thead>
                  <tr>
                    <th>게시글</th>
                    <th>버전</th>
                    <th>게시일</th>
                    <th>업데이트 구분</th>
                    <th>적용 조건</th>
                    <th>요약</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.version} className="release-history-board-row">
                      <td>
                        <button
                          className="release-history-title-button"
                          onClick={() => {
                            setSelectedVersion(record.version);
                          }}
                          type="button"
                        >
                          {buildPatchNoteTitle(record.version)}
                        </button>
                      </td>
                      <td>v{record.version}</td>
                      <td>{formatReleaseDate(record.publishedAt)}</td>
                      <td>{record.required ? "필수 업데이트" : "선택 업데이트"}</td>
                      <td>{record.requiresDbBackup ? "DB 백업 후 적용" : "즉시 적용 가능"}</td>
                      <td>{record.summary ?? record.headline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="surface-card">
            <p className="app-update-copy">조건에 맞는 패치이력이 없습니다.</p>
          </section>
        )}
      </section>
    </div>
  );
};
