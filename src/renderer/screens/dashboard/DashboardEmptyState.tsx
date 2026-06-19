import { EmptyState } from "../../components/EmptyState";

export const DashboardEmptyState = ({ message }: { message: string }) => (
  <EmptyState message={message} />
);
