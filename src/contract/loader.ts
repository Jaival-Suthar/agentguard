import { readFile } from "node:fs/promises";
import { parse } from "yaml";

import type { ExecutionContract } from "./types.js";
import { EXECUTION_CONTRACT_VERSION } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item) => typeof item === "string" && item.trim().length > 0,
    )
  ) {
    throw new Error(`${field} must be a non-empty array of strings`);
  }

  const items = value.map((item) => item.trim());

  if (new Set(items).size !== items.length) {
    throw new Error(`${field} must not contain duplicate values`);
  }

  return items;
}

function requiredRecord(
  root: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = root[field];

  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`);
  }

  return value;
}

function readBoolean(
  root: Record<string, unknown>,
  key: string,
  label: string,
): boolean {
  const value = root[key];

  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

function readNonNegativeInteger(
  root: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = root[key];

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(`${label} must be a non-negative integer`);
  }

  return value;
}

export function parseExecutionContract(text: string): ExecutionContract {
  const parsed: unknown = parse(text);

  if (!isRecord(parsed)) {
    throw new Error("Execution contract must be a YAML object");
  }

  if (parsed.version !== EXECUTION_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported execution contract version: ${String(parsed.version)}`,
    );
  }

  if (
    typeof parsed.name !== "string" ||
    parsed.name.trim().length === 0
  ) {
    throw new Error("name must be a non-empty string");
  }

  const actions = requiredRecord(parsed, "actions");
  const limits = requiredRecord(parsed, "limits");
  const requirements = requiredRecord(parsed, "requirements");

  const allow = stringArray(actions.allow, "actions.allow");

  const approvalRequired = stringArray(
    actions.approvalRequired,
    "actions.approvalRequired",
  );

  const deny = stringArray(actions.deny, "actions.deny");

  const actionSets = [
    ["allow", new Set(allow)],
    ["approvalRequired", new Set(approvalRequired)],
    ["deny", new Set(deny)],
  ] as const;

  for (let index = 0; index < actionSets.length; index += 1) {
    const current = actionSets[index];

    if (!current) {
      continue;
    }

    const [leftName, left] = current;

    for (
      let next = index + 1;
      next < actionSets.length;
      next += 1
    ) {
      const comparison = actionSets[next];

      if (!comparison) {
        continue;
      }

      const [rightName, right] = comparison;

      for (const action of left) {
        if (right.has(action)) {
          throw new Error(
            `Action "${action}" appears in both ${leftName} and ${rightName}`,
          );
        }
      }
    }
  }

  const maxRetries = readNonNegativeInteger(
    limits,
    "maxRetries",
    "limits.maxRetries",
  );

  const verificationRequired = readBoolean(
    requirements,
    "verificationRequired",
    "requirements.verificationRequired",
  );

  const requiredEvidence = stringArray(
    requirements.requiredEvidence,
    "requirements.requiredEvidence",
  );

  return {
    version: EXECUTION_CONTRACT_VERSION,
    name: parsed.name.trim(),

    ...(typeof parsed.description === "string" &&
    parsed.description.trim().length > 0
      ? { description: parsed.description.trim() }
      : {}),

    actions: {
      allow,
      approvalRequired,
      deny,
    },

    limits: {
      maxRetries,
    },

    requirements: {
      verificationRequired,
      requiredEvidence,
    },
  };
}

export async function loadExecutionContract(
  path: string,
): Promise<ExecutionContract> {
  const text = await readFile(path, "utf8");
  return parseExecutionContract(text);
}