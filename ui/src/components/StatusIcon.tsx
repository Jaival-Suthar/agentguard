import { FiCheck, FiAlertTriangle, FiX } from "react-icons/fi";
import type { CheckStatus } from "../types";

export function StatusIcon({ status, size = 18 }: { status: CheckStatus; size?: number }) {
  if (status === "PASS") return <FiCheck size={size} />;
  if (status === "WARN") return <FiAlertTriangle size={size} />;
  return <FiX size={size} />;
}
