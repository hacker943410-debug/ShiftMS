import type { ReleaseManifest } from "@shared/domain/app-update";
import { getReleaseManifestSections } from "@shared/domain/app-update";

interface ReleaseManifestContentProps {
  manifest: ReleaseManifest;
}

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

export const ReleaseManifestContent = ({ manifest }: ReleaseManifestContentProps) => {
  const sections = getReleaseManifestSections(manifest);

  return (
    <div className="release-manifest-content">
      <div className="release-manifest-summary-card">
        <div className="release-manifest-summary-copy">
          <strong>{manifest.headline}</strong>
          <p>
            배포 버전 v{manifest.version} · 게시일 {formatReleaseDate(manifest.publishedAt)}
          </p>
        </div>
        <div className="release-manifest-summary-badges">
          <span className={`pill ${manifest.required ? "danger" : "info"}`}>
            {manifest.required ? "필수 업데이트" : "선택 업데이트"}
          </span>
          <span className={`pill ${manifest.requiresDbBackup ? "warning" : "neutral"}`}>
            {manifest.requiresDbBackup ? "DB 백업 후 적용" : "즉시 적용 가능"}
          </span>
        </div>
      </div>

      {manifest.summary ? <p className="release-manifest-summary-text">{manifest.summary}</p> : null}

      <div className="release-manifest-sections">
        {sections.map((section) => (
          <section className="release-manifest-section" key={`${manifest.version}-${section.title}`}>
            <div className="release-manifest-section-heading">
              <strong>{section.title}</strong>
              {section.description ? <p>{section.description}</p> : null}
            </div>

            {section.items && section.items.length > 0 ? (
              <ol className="release-manifest-item-list">
                {section.items.map((item) => (
                  <li key={`${section.title}-${item.title}`} className="release-manifest-item">
                    <div className="release-manifest-item-copy">
                      <strong>{item.title}</strong>
                      {item.detail ? <p>{item.detail}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}

            {section.tables?.map((table, tableIndex) => (
              <div
                className="release-manifest-table-card"
                key={`${section.title}-${table.title ?? tableIndex}`}
              >
                {table.title ? <strong className="release-manifest-table-title">{table.title}</strong> : null}
                <div className="data-scroll">
                  <table className="info-table compact-table release-manifest-table">
                    <thead>
                      <tr>
                        {table.columns.map((column) => (
                          <th key={`${section.title}-${column}`}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, rowIndex) => (
                        <tr key={`${section.title}-row-${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <td key={`${section.title}-row-${rowIndex}-cell-${cellIndex}`}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
};
