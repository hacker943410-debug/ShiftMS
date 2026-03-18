export type OperationsMenuKey = "settings" | "holiday" | "rate" | "user" | "template";

export interface OperationsMenuItem {
  key: OperationsMenuKey;
  label: string;
  description: string;
  badge?: string;
}

interface OperationsMenuTabsProps {
  activeKey: OperationsMenuKey;
  items: OperationsMenuItem[];
  onChange: (key: OperationsMenuKey) => void;
}

export const OperationsMenuTabs = ({
  activeKey,
  items,
  onChange
}: OperationsMenuTabsProps) => {
  return (
    <div className="operations-menu-grid" role="tablist" aria-label="운영 관리 메뉴">
      {items.map((item) => {
        const isActive = item.key === activeKey;

        return (
          <button
            aria-selected={isActive}
            className={`operations-menu-tab${isActive ? " active" : ""}`}
            key={item.key}
            onClick={() => {
              onChange(item.key);
            }}
            role="tab"
            type="button"
          >
            <span className="operations-menu-copy">
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </span>
            {item.badge ? <span className={`pill ${isActive ? "info" : "neutral"}`}>{item.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
};
