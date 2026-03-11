interface StatusBadgeProps {
  tone: "good" | "warn" | "bad" | "info";
  label: string;
}

export const StatusBadge = ({ tone, label }: StatusBadgeProps) => (
  <span className={`status-pill ${tone}`}>{label}</span>
);
