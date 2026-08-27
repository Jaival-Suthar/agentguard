export type ChaosMode =
  | "malformed-result"
  | "timeout";

export interface ChaosLookupResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

export async function executeChaosLookup(
  incidentId: string,
  mode: ChaosMode,
  delayMs: number,
): Promise<ChaosLookupResult> {
  if (mode === "timeout") {
    await new Promise<void>(
      (resolve) => {
        setTimeout(
          resolve,
          delayMs,
        );
      },
    );

    /*
     * The timeout mode must never fall through
     * to a successful incident response.
     *
     * The deterministic error gives the runtime
     * an observable failed tool outcome.
     */
    throw new Error(
      `Chaos MCP timeout injected for incident ${incidentId}`,
    );
  }

  return {
    content: [
      {
        type: "text",
        /*
         * Deliberately malformed JSON:
         * missing the closing brace.
         */
        text: `{"found":true,"incident_id":"${incidentId}"`,
      },
    ],
  };
}