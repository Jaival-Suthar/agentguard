import test from "node:test";
import assert from "node:assert/strict";

import {
  parseExecutionContract,
} from "../../src/contract/loader.js";

import {
  verifyObservations,
} from "../../src/verifier/verify.js";

const contract =
  parseExecutionContract(`
version: 1
name: incident-investigation
actions:
  allow:
    - mcp:database.read
  approvalRequired:
    - mcp:github.write
  deny:
    - host:filesystem.read
limits:
  maxRetries: 3
requirements:
  verificationRequired: true
  requiredEvidence:
    - root_cause
    - verification
`);

function verifiedOutcome(
  eventId = "outcome-event",
): {
  kind: "outcome";
  outcomeVerified: true;
  eventId: string;
} {
  return {
    kind: "outcome",
    outcomeVerified: true,
    eventId,
  };
}

test(
  "passes an explicitly allowed action with a verified outcome",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action:
              "mcp:database.read",
            eventId:
              "event-1",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "PASS",
    );

    assert.equal(
      report.failures,
      0,
    );

    assert.equal(
      report.findings[0]?.code,
      "ACTION_ALLOWED",
    );
  },
);

test(
  "fails an explicitly denied action",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action:
              "host:filesystem.read",
            eventId:
              "event-2",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "FAIL",
    );

    assert.equal(
      report.failures,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "ACTION_DENIED",
    );
  },
);

test(
  "passes an approval-required action when approval is observed",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action:
              "mcp:github.write",
            approved: true,
            eventId:
              "event-3",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "PASS",
    );

    assert.equal(
      report.findings[0]?.code,
      "APPROVAL_GRANTED",
    );
  },
);

test(
  "passes an approval-required action with a separate correlated approval",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action:
              "mcp:github.write",
            eventId:
              "action-event-1",
          },

          {
            kind: "approval",
            approved: true,
            actionEventId:
              "action-event-1",
            eventId:
              "approval-event-1",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "PASS",
    );

    assert.equal(
      report.failures,
      0,
    );

    assert.equal(
      report.findings[0]?.code,
      "APPROVAL_GRANTED",
    );
  },
);

test(
  "fails an approval-required action when approval is missing",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action:
              "mcp:github.write",
            eventId:
              "event-4",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "FAIL",
    );

    assert.equal(
      report.failures,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "APPROVAL_MISSING",
    );
  },
);

test(
  "fails when retry limit is exceeded",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "retry",
            retryCount: 4,
            eventId:
              "event-5",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "FAIL",
    );

    assert.equal(
      report.failures,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "RETRY_LIMIT_EXCEEDED",
    );
  },
);

test(
  "warns when retry count is negative",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "retry",
            retryCount: -1,
            eventId:
              "event-negative-retry",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "WARN",
    );

    assert.equal(
      report.warnings,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "MALFORMED_OBSERVATION",
    );
  },
);

test(
  "passes when retry count is within the contract limit",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "retry",
            retryCount: 2,
            eventId:
              "event-retry-ok",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "PASS",
    );

    assert.equal(
      report.findings[0]?.code,
      "RETRY_WITHIN_LIMIT",
    );
  },
);

test(
  "fails when required evidence is missing",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "evidence",
            evidence: [
              "root_cause",
            ],
            eventId:
              "event-6",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "FAIL",
    );

    assert.equal(
      report.failures,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "REQUIRED_EVIDENCE_MISSING",
    );
  },
);

test(
  "passes when all required evidence is present",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "evidence",
            evidence: [
              "root_cause",
              "verification",
            ],
            eventId:
              "event-evidence-ok",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "PASS",
    );

    assert.equal(
      report.findings[0]?.code,
      "REQUIRED_EVIDENCE_PRESENT",
    );
  },
);

test(
  "fails when outcome is present but unverified",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "outcome",
            outcomeVerified: false,
            eventId:
              "event-7",
          },
        ],
      );

    assert.equal(
      report.verdict,
      "FAIL",
    );

    assert.equal(
      report.failures,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "OUTCOME_UNVERIFIED",
    );
  },
);

test(
  "fails when verification is required but no outcome is observed",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action:
              "mcp:database.read",
            eventId:
              "event-no-outcome",
          },
        ],
      );

    assert.equal(
      report.verdict,
      "FAIL",
    );

    assert.equal(
      report.failures,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "ACTION_ALLOWED",
    );

    assert.equal(
      report.findings[1]?.code,
      "OUTCOME_MISSING",
    );
  },
);

test(
  "fails an empty trajectory when verification is required",
  () => {
    const report =
      verifyObservations(
        contract,
        [],
      );

    assert.equal(
      report.verdict,
      "FAIL",
    );

    assert.equal(
      report.observationsEvaluated,
      0,
    );

    assert.equal(
      report.failures,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "OUTCOME_MISSING",
    );
  },
);

test(
  "passes when outcome verification is satisfied",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          verifiedOutcome(
            "event-outcome-ok",
          ),
        ],
      );

    assert.equal(
      report.verdict,
      "PASS",
    );

    assert.equal(
      report.findings[0]?.code,
      "OUTCOME_VERIFIED",
    );
  },
);

test(
  "treats a verified tool error as a verified outcome",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action:
              "mcp:database.read",
            eventId:
              "event-tool-error",
          },

          {
            kind: "outcome",
            outcomeVerified: true,
            eventId:
              "event-tool-error-outcome",
            actionEventId:
              "event-tool-error",
          },
        ],
      );

    assert.equal(
      report.verdict,
      "PASS",
    );

    assert.equal(
      report.failures,
      0,
    );

    assert.ok(
      report.findings.some(
        (finding) =>
          finding.code ===
          "OUTCOME_VERIFIED",
      ),
    );
  },
);

test(
  "warns on an unsupported observation kind",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind:
              "bogus" as never,

            eventId:
              "event-unknown-kind",
          },

          verifiedOutcome(),
        ],
      );

    assert.equal(
      report.verdict,
      "WARN",
    );

    assert.equal(
      report.warnings,
      1,
    );

    assert.equal(
      report.findings[0]?.code,
      "MALFORMED_OBSERVATION",
    );
  },
);

test(
  "passes a failed outcome when a later retry verifies the same action",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action: "mcp:database.read",
            eventId: "action-attempt-1",
          },
          {
            kind: "outcome",
            outcomeVerified: false,
            eventId: "outcome-attempt-1",
            actionEventId: "action-attempt-1",
          },
          {
            kind: "action",
            action: "mcp:database.read",
            eventId: "action-attempt-2",
          },
          {
            kind: "outcome",
            outcomeVerified: true,
            eventId: "outcome-attempt-2",
            actionEventId: "action-attempt-2",
          },
          {
            kind: "retry",
            retryCount: 1,
          },
        ],
      );

    assert.equal(report.verdict, "PASS");
    assert.equal(report.failures, 0);

    assert.ok(
      report.findings.some(
        (finding) =>
          finding.code === "OUTCOME_RECOVERED",
      ),
    );
  },
);

test(
  "still fails an unverified outcome when no later verified retry exists",
  () => {
    const report =
      verifyObservations(
        contract,
        [
          {
            kind: "action",
            action: "mcp:database.read",
            eventId: "action-failed",
          },
          {
            kind: "outcome",
            outcomeVerified: false,
            eventId: "outcome-failed",
            actionEventId: "action-failed",
          },
        ],
      );

    assert.equal(report.verdict, "FAIL");
    assert.ok(
      report.findings.some(
        (finding) =>
          finding.code === "OUTCOME_UNVERIFIED",
      ),
    );
  },
);