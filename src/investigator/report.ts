import type {
  IncidentFacts,
  InvestigationReport,
  InvestigationStatus,
} from "./types.js";

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseIncidentFacts(
  value: Record<string, unknown>,
): IncidentFacts {
  const incident: IncidentFacts = {
    incidentId:
      stringValue(value.incident_id) ??
      stringValue(value.incidentId) ??
      "unknown",
  };

  const service = stringValue(value.service);
  const severity = stringValue(value.severity);
  const status = stringValue(value.status);
  const suspectedComponent =
    stringValue(value.suspected_component) ??
    stringValue(value.suspectedComponent);

  if (service) {
    incident.service = service;
  }

  if (severity) {
    incident.severity = severity;
  }

  if (status) {
    incident.status = status;
  }

  if (suspectedComponent) {
    incident.suspectedComponent = suspectedComponent;
  }

  return incident;
}

export function buildInvestigationReport(
  input: {
    targetIncidentId: string;
    status: InvestigationStatus;
    evidenceRetrieved: boolean;
    rawResponse: string;
    incidentValue?: Record<string, unknown>;
  },
): InvestigationReport {
  const incident = input.incidentValue
    ? parseIncidentFacts(input.incidentValue)
    : undefined;

  const knownFacts: string[] = [];

  if (incident) {
    knownFacts.push(`Incident ID: ${incident.incidentId}`);

    if (incident.service) {
      knownFacts.push(`Service: ${incident.service}`);
    }

    if (incident.severity) {
      knownFacts.push(`Severity: ${incident.severity}`);
    }

    if (incident.status) {
      knownFacts.push(`Status: ${incident.status}`);
    }

    if (incident.suspectedComponent) {
      knownFacts.push(
        `Suspected component: ${incident.suspectedComponent}`,
      );
    }
  }

  const unknowns: string[] = [
    "Root cause has not been independently established.",
    "Remediation has not been executed or verified.",
  ];

  const findings = [
    `Investigation status: ${input.status}`,
    `Evidence retrieved: ${input.evidenceRetrieved ? "YES" : "NO"}`,
  ];

  if (incident) {
    findings.push(
      `Incident ${incident.incidentId} was retrieved from the connected incident lookup tool.`,
      ...knownFacts,
    );
  }

  return {
    targetIncidentId: input.targetIncidentId,
    status: input.status,
    evidenceRetrieved: input.evidenceRetrieved,
    ...(incident ? { incident } : {}),
    findings,
    knownFacts,
    unknowns,
    nextActions: [
      "Gather additional evidence before claiming root cause.",
      "Verify the proposed remediation against observed evidence.",
    ],
    rawResponse: input.rawResponse,
  };
}
