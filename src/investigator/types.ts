export type InvestigationStatus = "COMPLETED" | "INCOMPLETE";
export type IncidentLookupResult = "FOUND" | "NOT_FOUND" | "UNKNOWN";

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
  incidentLookupResult: IncidentLookupResult;
  incident?: IncidentFacts;
  findings: string[];
  knownFacts: string[];
  unknowns: string[];
  nextActions: string[];
  rawResponse: string;
}
