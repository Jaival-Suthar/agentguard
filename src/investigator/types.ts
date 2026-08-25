export type InvestigationStatus = "COMPLETED" | "INCOMPLETE";

export interface IncidentFacts {
  incidentId: string;
  service?: string;
  severity?: string;
  status?: string;
  suspectedComponent?: string;
}

export interface InvestigationReport {
  targetIncidentId: string;
  status: InvestigationStatus;
  evidenceRetrieved: boolean;
  incident?: IncidentFacts;
  findings: string[];
  knownFacts: string[];
  unknowns: string[];
  nextActions: string[];
  rawResponse: string;
}
