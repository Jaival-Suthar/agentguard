import { Tag } from "primereact/tag";
import type { CheckStatus, AssuranceStatus } from "../types";

export function StatusTag({ value }: { value: CheckStatus | AssuranceStatus }) {
  const severity = value === "PASS" || value === "RECOVERED" || value === "COMPLETED" ? "success" : value === "WARN" ? "warning" : "danger";
  return <Tag value={value.replaceAll("_", " ")} severity={severity} rounded />;
}
