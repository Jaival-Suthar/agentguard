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
    throw new Error(`${field} must be an array of non-empty strings`);
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

function readOrdering(
  value: unknown,
): Array<{ action: string; before: string }> {
  if (!Array.isArray(value)) {
    throw new Error("ordering.before must be an array");
  }

  const pairs = value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`ordering.before[${index}] must be an object`);
    }

    const action = item.action;
    const before = item.before;

    if (typeof action !== "string" || action.trim().length === 0) {
      throw new Error(
        `ordering.before[${index}].action must be a non-empty string`,
      );
    }

    if (typeof before !== "string" || before.trim().length === 0) {
      throw new Error(
        `ordering.before[${index}].before must be a non-empty string`,
      );
    }

    const normalizedAction = action.trim();
    const normalizedBefore = before.trim();

    if (normalizedAction === normalizedBefore) {
      throw new Error(
        `ordering.before[${index}] cannot require an action to occur before itself`,
      );
    }

    return {
      action: normalizedAction,
      before: normalizedBefore,
    };
  });

  const seen = new Set<string>();

  for (const pair of pairs) {
    const key = `${pair.action}\u0000${pair.before}`;

    if (seen.has(key)) {
      throw new Error(
        `ordering.before must not contain duplicate relationship "${pair.action}" before "${pair.before}"`,
      );
    }

    seen.add(key);
  }

  return pairs;
}

function readNonNegativeInteger(
  root: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = root[key];

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(`${label} must be a non-negative safe integer`);
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

  const requiredActions = stringArray(
    requirements.requiredActions ?? [],
    "requirements.requiredActions",
  );

  // Trajectory requirements can only target actions that are
  // executable or approval-gated. A denied action can never
  // simultaneously be a required successful trajectory action.
  const trajectoryActions = new Set([
    ...allow,
    ...approvalRequired,
  ]);

  for (const action of requiredActions) {
    if (!trajectoryActions.has(action)) {
      if (deny.includes(action)) {
        throw new Error(
          `Required action "${action}" cannot be denied; required trajectory actions must be declared in actions.allow or actions.approvalRequired`,
        );
      }

      throw new Error(
        `Required action "${action}" must be declared in actions.allow or actions.approvalRequired`,
      );
    }
  }

  const orderingRoot = parsed.ordering;
  const ordering =
    orderingRoot === undefined
      ? { before: [] }
      : requiredRecord(parsed, "ordering");

  const before = readOrdering(ordering.before);

  for (const relationship of before) {
    if (!trajectoryActions.has(relationship.action)) {
      if (deny.includes(relationship.action)) {
        throw new Error(
          `Ordering action "${relationship.action}" cannot be denied; ordering endpoints must be declared in actions.allow or actions.approvalRequired`,
        );
      }

      throw new Error(
        `Ordering action "${relationship.action}" must be declared in actions.allow or actions.approvalRequired`,
      );
    }

    if (!trajectoryActions.has(relationship.before)) {
      if (deny.includes(relationship.before)) {
        throw new Error(
          `Ordering action "${relationship.before}" cannot be denied; ordering endpoints must be declared in actions.allow or actions.approvalRequired`,
        );
      }

      throw new Error(
        `Ordering action "${relationship.before}" must be declared in actions.allow or actions.approvalRequired`,
      );
    }
  }

  const graph = new Map<string, string[]>();

  for (const relationship of before) {
    const edges = graph.get(relationship.action) ?? [];
    edges.push(relationship.before);
    graph.set(relationship.action, edges);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(action: string): void {
    if (visiting.has(action)) {
      throw new Error(
        "ordering.before must not contain cyclic relationships",
      );
    }

    if (visited.has(action)) {
      return;
    }

    visiting.add(action);

    for (const next of graph.get(action) ?? []) {
      visit(next);
    }

    visiting.delete(action);
    visited.add(action);
  }

  for (const action of graph.keys()) {
    visit(action);
  }

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
      requiredActions,
      requiredEvidence,
    },

    ordering: {
      before,
    },
  };
}

export async function loadExecutionContract(
  path: string,
): Promise<ExecutionContract> {
  const text = await readFile(path, "utf8");
  return parseExecutionContract(text);
}
