import test from "node:test";
import assert from "node:assert/strict";

import { buildInvestigationReport } from "../../src/investigator/report.js";

test("marks a found incident lookup as completed evidence", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-042",
    status: "COMPLETED",
    incidentLookupResult: "FOUND",
    rawResponse: "raw agent response",
    incidentValue: {
      found: true,
      incident_id: "INC-042",
      service: "analytics",
      severity: "high",
      status: "investigating",
      suspected_component: "nightly-worker",
    },
  });

  assert.equal(report.targetIncidentId, "INC-042");
  assert.equal(report.status, "COMPLETED");
  assert.equal(report.incidentLookupResult, "FOUND");
  assert.equal(report.evidenceRetrieved, true);
  assert.equal(report.incident?.incidentId, "INC-042");
  assert.equal(report.incident?.service, "analytics");
  assert.equal(report.incident?.severity, "high");
  assert.equal(report.incident?.status, "investigating");
  assert.equal(report.incident?.suspectedComponent, "nightly-worker");
  assert.ok(report.knownFacts.includes("Incident ID: INC-042"));
  assert.ok(report.findings.includes("Incident lookup result: FOUND"));
});

test("marks a not-found incident lookup as incomplete without fabricating facts", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-999",
    status: "INCOMPLETE",
    incidentLookupResult: "NOT_FOUND",
    rawResponse: "raw agent response",
    incidentValue: {
      found: false,
      incident_id: "INC-999",
    },
  });

  assert.equal(report.targetIncidentId, "INC-999");
  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.incidentLookupResult, "NOT_FOUND");
  assert.equal(report.evidenceRetrieved, false);
  assert.equal(report.incident, undefined);
  assert.equal(report.knownFacts.length, 0);
  assert.ok(report.findings.includes("Incident lookup result: NOT_FOUND"));
  assert.ok(report.findings.includes("Evidence retrieved: NO"));
});

test("marks failures before tool evidence as incomplete without fabricating facts", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-042",
    status: "INCOMPLETE",
    incidentLookupResult: "UNKNOWN",
    rawResponse: "",
  });

  assert.equal(report.targetIncidentId, "INC-042");
  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.incidentLookupResult, "UNKNOWN");
  assert.equal(report.evidenceRetrieved, false);
  assert.equal(report.incident, undefined);
  assert.equal(report.knownFacts.length, 0);
  assert.equal(report.rawResponse, "");
  assert.ok(report.findings.includes("Evidence retrieved: NO"));
});
