import { FiCheck, FiAlertTriangle, FiCircle, FiX } from "react-icons/fi";
import type { CheckStatus, TimelineEntry } from "../types";

export function StatusIcon({
  status,
  size = 18,
}: {
  status: CheckStatus | TimelineEntry["state"];
  size?: number;
}) {
  if (status === "LIVE") return <FiCircle size={size} />;
  if (status === "PASS") return <FiCheck size={size} />;
  if (status === "WARN") return <FiAlertTriangle size={size} />;
  return <FiX size={size} />;
}
