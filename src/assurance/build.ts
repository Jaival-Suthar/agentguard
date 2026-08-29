import type {
  AssuranceArtifact,
  AssuranceBuildInput,
  AssuranceCheck,
  AssuranceStatus,
  AssuranceVerdict,
} from "./types.js";

function highestVerdict(
  values: readonly AssuranceVerdict[],
): AssuranceVerdict {
  if (values.includes("FAIL")) {
    return "FAIL";
  }

  if (values.includes("WARN")) {
    return "WARN";
  }

  return "PASS";
}

function executionCheck(
  input: AssuranceBuildInput,
): AssuranceCheck {
  if (input.recovery.exhausted) {
    return {
      status: "FAIL",
      summary: "Execution did not complete successfully.",
      details: [
        `Recovery exhausted after ${input.recovery.attempts} attempt(s).`,
      ],
    };
  }

  if (input.recovery.recovered) {
    return {
      status: "PASS",
      summary: "Execution completed after recovery.",
      details: [
        `Execution required ${input.recovery.attempts} attempt(s).`,
        `Recovery performed ${input.recovery.retries} retry(ies).`,
      ],
    };
  }

  return {
    status: "PASS",
    summary: "Execution completed successfully.",
    details: [
      "Execution completed on the initial attempt.",
    ],
  };
}

function recoveryCheck(
  input: AssuranceBuildInput,
): AssuranceCheck {
  if (input.recovery.exhausted) {
    return {
      status: "FAIL",
      summary: "Recovery exhausted its retry budget.",
      details: [
        `Attempts: ${input.recovery.attempts}`,
        `Retries: ${input.recovery.retries}`,
        `Maximum retries: ${input.recovery.maxRetries}`,
      ],
    };
  }

  if (input.recovery.recovered) {
    return {
      status: "PASS",
      summary: "Execution recovered successfully.",
      details: [
        `Recovered after ${input.recovery.retries} retry(ies).`,
      ],
    };
  }

  return {
    status: "PASS",
    summary: "No recovery was required.",
  };
}

function policyCheck(
  input: AssuranceBuildInput,
): AssuranceCheck {
  if (input.policyVerdict === "BLOCK") {
    return {
      status: "FAIL",
      summary: "Policy blocked the requested action.",
    };
  }

  if (input.policyVerdict === "APPROVAL_REQUIRED") {
    return {
      status: "WARN",
      summary: "Policy requires human approval before execution.",
    };
  }

  return {
    status: "PASS",
    summary: "Policy requirements were satisfied.",
  };
}

function evidenceCheck(
  input: AssuranceBuildInput,
): AssuranceCheck {
  const report = input.evidenceReport;

  return {
    status:
      report.verdict === "FAIL"
        ? "FAIL"
        : report.verdict === "WARN"
          ? "WARN"
          : "PASS",
    summary:
      report.verdict === "PASS"
        ? "Required evidence was independently verified."
        : `Evidence verification returned ${report.verdict}.`,
    details: [
      `Verified evidence items: ${report.evidence.length}`,
      `Passed findings: ${report.passed}`,
      `Warnings: ${report.warnings}`,
      `Failures: ${report.failures}`,
    ],
  };
}

function contractCheck(
  input: AssuranceBuildInput,
): AssuranceCheck {
  const report = input.contractReport;

  return {
    status:
      report.verdict === "FAIL"
        ? "FAIL"
        : report.verdict === "WARN"
          ? "WARN"
          : "PASS",
    summary:
      report.verdict === "PASS"
        ? "Execution contract requirements were satisfied."
        : `Contract verification returned ${report.verdict}.`,
    details: [
      `Observations evaluated: ${report.observationsEvaluated}`,
      `Passed findings: ${report.passed}`,
      `Warnings: ${report.warnings}`,
      `Failures: ${report.failures}`,
    ],
  };
}

function statusFor(
  input: AssuranceBuildInput,
  verdict: AssuranceVerdict,
): AssuranceStatus {
  if (input.policyVerdict === "BLOCK") {
    return "BLOCKED";
  }

  if (input.recovery.exhausted) {
    return "EXHAUSTED";
  }

  if (verdict === "FAIL") {
    return "FAILED";
  }

  if (input.recovery.recovered) {
    return "RECOVERED";
  }

  return "COMPLETED";
}

function collectFailureReasons(
  checks: readonly AssuranceCheck[],
): string[] {
  return checks
    .filter((check) => check.status === "FAIL")
    .map((check) => check.summary);
}

export function buildAssuranceArtifact(
  input: AssuranceBuildInput,
): AssuranceArtifact {
  const policy = policyCheck(input);
  const execution = executionCheck(input);
  const recovery = recoveryCheck(input);
  const evidence = evidenceCheck(input);
  const contractVerification = contractCheck(input);

  const verdict = highestVerdict([
    policy.status,
    execution.status,
    recovery.status,
    evidence.status,
    contractVerification.status,
  ]);

  const status = statusFor(input, verdict);

  const failureReasons = collectFailureReasons([
    policy,
    execution,
    recovery,
    evidence,
    contractVerification,
  ]);

  return {
    version: 1,

    runId: input.runId,
    contract: input.contractName,
    ...(input.incidentId
      ? { incidentId: input.incidentId }
      : {}),

    status,
    verdict,

    policy,
    execution,

    recovery: {
      status: input.recovery.exhausted
        ? "EXHAUSTED"
        : input.recovery.recovered
          ? "RECOVERED"
          : "NOT_REQUIRED",
      attempts: input.recovery.attempts,
      retries: input.recovery.retries,
      maxRetries: input.recovery.maxRetries,
    },

    evidence,
    contractVerification,

    summary:
      verdict === "PASS"
        ? input.recovery.recovered
          ? "Execution recovered successfully and all assurance checks passed."
          : "Execution completed and all assurance checks passed."
        : failureReasons.join(" "),

    failureReasons,

    generatedAt:
      input.generatedAt ?? new Date().toISOString(),
  };
}