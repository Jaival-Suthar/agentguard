import test from "node:test";
import assert from "node:assert/strict";

import { buildInvestigationReport } from "../../src/investigator/report.js";

test("marks a successful investigation as completed", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-042",
    status: "COMPLETED",
    evidenceRetrieved: true,
    rawResponse: "raw agent response",
    incidentValue: {
      incident_id: "INC-042",
      service: "analytics",
      severity: "high",
      status: "investigating",
      suspected_component: "nightly-worker",
    },
  });

  assert.equal(report.targetIncidentId, "INC-042");
  assert.equal(report.status, "COMPLETED");
  assert.equal(report.evidenceRetrieved, true);
  assert.equal(report.incident?.incidentId, "INC-042");
  assert.equal(report.incident?.service, "analytics");
  assert.equal(report.incident?.severity, "high");
  assert.equal(report.incident?.status, "investigating");
  assert.equal(report.incident?.suspectedComponent, "nightly-worker");

  assert.ok(report.knownFacts.includes("Incident ID: INC-042"));
  assert.ok(report.knownFacts.includes("Service: analytics"));
  assert.ok(
    report.unknowns.some((item) => item.includes("Root cause")),
  );
  assert.equal(report.rawResponse, "raw agent response");
});

test("preserves partial tool evidence when the investigation fails", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-042",
    status: "INCOMPLETE",
    evidenceRetrieved: true,
    rawResponse: "partial model response",
    incidentValue: {
      incident_id: "INC-042",
      service: "analytics",
      severity: "high",
      status: "investigating",
      suspected_component: "nightly-worker",
    },
  });

  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.evidenceRetrieved, true);
  assert.equal(report.incident?.incidentId, "INC-042");
  assert.ok(report.knownFacts.includes("Incident ID: INC-042"));
  assert.equal(report.rawResponse, "partial model response");
  assert.notEqual(report.status, "COMPLETED");
});

test("marks failures before tool evidence as incomplete without fabricating facts", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-042",
    status: "INCOMPLETE",
    evidenceRetrieved: false,
    rawResponse: "",
  });

  assert.equal(report.targetIncidentId, "INC-042");
  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.evidenceRetrieved, false);
  assert.equal(report.incident, undefined);
  assert.equal(report.knownFacts.length, 0);
  assert.equal(report.rawResponse, "");
  assert.ok(report.findings.includes("Evidence retrieved: NO"));
});
