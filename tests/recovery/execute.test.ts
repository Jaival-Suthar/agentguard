import test from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContract } from "../../src/contract/index.js";
import {
  executeWithRecovery,
  RecoveryExhaustedError,
} from "../../src/recovery/index.js";

function makeContract(
  maxRetries: number,
): ExecutionContract {
  return {
    version: 1,
    name: "recovery-test",
    actions: {
      allow: ["test:action"],
      approvalRequired: [],
      deny: [],
    },
    limits: {
      maxRetries,
    },
    requirements: {
      verificationRequired: false,
      requiredActions: [],
      requiredEvidence: [],
    },
    ordering: {
      before: [],
    },
  };
}

test("returns the successful result after a failed first attempt", async () => {
  let executions = 0;

  const result = await executeWithRecovery(
    makeContract(3),
    () => {
      executions += 1;

      if (executions === 1) {
        throw new Error("transient failure");
      }

      return "success";
    },
  );

  assert.equal(executions, 2);
  assert.equal(result.result, "success");
  assert.equal(result.attempts, 2);
  assert.equal(result.retries, 1);
  assert.equal(result.recovered, true);

  assert.equal(result.history.length, 2);
  assert.equal(result.history[0]?.success, false);
  assert.equal(result.history[1]?.success, true);
});

test("continues retrying until the executor succeeds", async () => {
  let executions = 0;

  const result = await executeWithRecovery(
    makeContract(3),
    () => {
      executions += 1;

      if (executions < 3) {
        throw new Error(`failure-${executions}`);
      }

      return "recovered";
    },
  );

  assert.equal(executions, 3);
  assert.equal(result.result, "recovered");
  assert.equal(result.attempts, 3);
  assert.equal(result.retries, 2);
  assert.equal(result.recovered, true);

  assert.deepEqual(
    result.history.map((attempt) => attempt.attempt),
    [1, 2, 3],
  );
});

test("allows maxRetries retries in addition to the initial attempt", async () => {
  let executions = 0;

  await assert.rejects(
    executeWithRecovery(
      makeContract(3),
      () => {
        executions += 1;
        throw new Error(`failure-${executions}`);
      },
    ),
    (error: unknown) =>
      error instanceof RecoveryExhaustedError &&
      error.attempts === 4 &&
      error.retries === 3 &&
      error.lastError instanceof Error &&
      error.lastError.message === "failure-4",
  );

  assert.equal(executions, 4);
});

test("does not retry when maxRetries is zero", async () => {
  let executions = 0;

  await assert.rejects(
    executeWithRecovery(
      makeContract(0),
      () => {
        executions += 1;
        throw new Error("permanent failure");
      },
    ),
    (error: unknown) =>
      error instanceof RecoveryExhaustedError &&
      error.attempts === 1 &&
      error.retries === 0 &&
      error.lastError instanceof Error &&
      error.lastError.message === "permanent failure",
  );

  assert.equal(executions, 1);
});

test("supports rejected promises as failed executions", async () => {
  let executions = 0;

  const result = await executeWithRecovery(
    makeContract(1),
    async () => {
      executions += 1;

      if (executions === 1) {
        throw new Error("rejected");
      }

      return "async success";
    },
  );

  assert.equal(executions, 2);
  assert.equal(result.result, "async success");
  assert.equal(result.recovered, true);
});

test("runs onRetry before each retry", async () => {
  let executions = 0;
  const retryEvents: Array<{
    retry: number;
    message: string;
  }> = [];

  const result = await executeWithRecovery(
    makeContract(2),
    () => {
      executions += 1;

      if (executions < 3) {
        throw new Error(`failure-${executions}`);
      }

      return "success";
    },
    {
      onRetry: (retry, error) => {
        assert.ok(error instanceof Error);
        retryEvents.push({
          retry,
          message: error.message,
        });
      },
    },
  );

  assert.equal(result.result, "success");
  assert.deepEqual(retryEvents, [
    { retry: 1, message: "failure-1" },
    { retry: 2, message: "failure-2" },
  ]);
});

test("rejects an invalid runtime retry limit", async () => {
  const contract = makeContract(1.5);

  await assert.rejects(
    executeWithRecovery(contract, () => "never"),
    /maxRetries must be a non-negative safe integer/,
  );
});


test("keeps the validated retry bound when the executor mutates the contract", async () => {
  const contract = makeContract(1);
  let executions = 0;

  await assert.rejects(
    executeWithRecovery(contract, () => {
      executions += 1;
      contract.limits.maxRetries = 100;
      throw new Error(`failure-${executions}`);
    }),
    (error: unknown) =>
      error instanceof RecoveryExhaustedError &&
      error.attempts === 2 &&
      error.retries === 1 &&
      error.lastError instanceof Error &&
      error.lastError.message === "failure-2",
  );

  assert.equal(executions, 2);
});

test("keeps the validated retry bound when onRetry mutates the contract", async () => {
  const contract = makeContract(1);
  let executions = 0;

  await assert.rejects(
    executeWithRecovery(
      contract,
      () => {
        executions += 1;
        throw new Error(`failure-${executions}`);
      },
      {
        onRetry: () => {
          contract.limits.maxRetries = 100;
        },
      },
    ),
    (error: unknown) =>
      error instanceof RecoveryExhaustedError &&
      error.attempts === 2 &&
      error.retries === 1 &&
      error.lastError instanceof Error &&
      error.lastError.message === "failure-2",
  );

  assert.equal(executions, 2);
});

test("rejects retry limits above Number.MAX_SAFE_INTEGER", async () => {
  const contract = makeContract(Number.MAX_SAFE_INTEGER + 1);

  await assert.rejects(
    executeWithRecovery(contract, () => "never"),
    /maxRetries must be a non-negative safe integer/,
  );
});
