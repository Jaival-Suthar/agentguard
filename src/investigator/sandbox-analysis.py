import json
import sys


def fail(message):
    print(message, file=sys.stderr)
    sys.exit(1)


try:
    incident = json.load(sys.stdin)
except Exception as exc:
    fail(f"Invalid JSON input: {exc}")


if not isinstance(incident, dict):
    fail("Incident response must be a JSON object")


required = [
    "incident_id",
    "service",
    "severity",
    "status",
    "suspected_component",
    "evidence",
]

missing = [field for field in required if field not in incident]

if missing:
    fail(f"Missing required fields: {', '.join(missing)}")


# Validate the identity of the synthetic fixture.
# The sandbox must fail closed if the input is not the expected incident.

if incident["incident_id"] != "INC-042":
    fail("Unexpected incident_id")

if incident["service"] != "analytics":
    fail("Unexpected service")

if incident["severity"] != "high":
    fail("Unexpected severity")

if incident["status"] != "investigating":
    fail("Unexpected incident status")

if incident["suspected_component"] != "nightly-worker":
    fail("Unexpected suspected_component")


evidence = incident["evidence"]

if not isinstance(evidence, dict):
    fail("Evidence must be an object")


required_evidence = [
    "deployment",
    "metrics",
    "logs",
    "configuration",
]

missing_evidence = [
    field for field in required_evidence
    if field not in evidence
]

if missing_evidence:
    fail(
        f"Missing diagnostic evidence: "
        f"{', '.join(missing_evidence)}"
    )


deployment = evidence["deployment"]
metrics = evidence["metrics"]
logs = evidence["logs"]
configuration = evidence["configuration"]


if not all(
    isinstance(value, dict)
    for value in [
        deployment,
        metrics,
        configuration,
    ]
):
    fail(
        "Deployment, metrics, and configuration "
        "evidence must be objects"
    )


if not isinstance(logs, list) or not logs:
    fail("Logs evidence must be a non-empty list")


# Validate deployment evidence.

expected_deployment = {
    "component": "nightly-worker",
    "version": "4c21",
    "previous_version": "4c20",
}

for key, expected in expected_deployment.items():
    if deployment.get(key) != expected:
        fail(
            f"Deployment evidence mismatch for {key}"
        )


# Validate configuration evidence.

if configuration.get("worker_concurrency") != 32:
    fail(
        "Configuration evidence does not establish "
        "the expected concurrency"
    )

if configuration.get("database_pool_size") != 20:
    fail(
        "Configuration evidence does not establish "
        "the expected database pool size"
    )


# Validate metrics evidence.

if metrics.get("error_rate_percent") != 18.7:
    fail(
        "Metrics evidence does not establish "
        "the expected error rate"
    )

if metrics.get("database_connection_exhaustion") is not True:
    fail(
        "Metrics evidence does not establish "
        "database connection exhaustion"
    )

if metrics.get("queue_depth") != 18420:
    fail(
        "Metrics evidence does not establish "
        "the expected queue depth"
    )


# Validate log evidence.

log_text = "\n".join(
    str(entry)
    for entry in logs
)

required_log_fragments = [
    "nightly-worker",
    "database connection pool exhausted",
    "deployment=4c21",
]

for fragment in required_log_fragments:
    if fragment not in log_text:
        fail(
            f"Log evidence missing required signal: "
            f"{fragment}"
        )


analysis = {
    "incident": {
        "incident_id": incident["incident_id"],
        "service": incident["service"],
        "severity": incident["severity"],
        "status": incident["status"],
        "suspected_component": incident["suspected_component"],
    },

    "root_cause_candidate": incident["suspected_component"],

    "root_cause_explanation": (
        "Deployment 4c21 increased nightly-worker concurrency "
        "to 32 while the analytics database pool remained at "
        "20 connections, causing database connection exhaustion "
        "and the observed worker failures."
    ),

    "evidence_checks": {
        "deployment": "verified",
        "configuration": "verified",
        "metrics": "verified",
        "logs": "verified",
    },

    "supporting_facts": [
        "Deployment 4c21 is the observed version for nightly-worker.",
        "nightly-worker concurrency is 32.",
        "The analytics database pool is limited to 20 connections.",
        "Database connection exhaustion is observed.",
        "Error rate is 18.7% and queue depth is 18420.",
        "Logs contain database connection pool exhaustion errors tied to deployment 4c21.",
    ],

    "recommended_remediation": (
        "Rollback deployment 4c21 to stable version 4c20, "
        "subject to human approval."
    ),
}


with open(
    "analysis.json",
    "w",
    encoding="utf-8",
) as handle:
    json.dump(
        analysis,
        handle,
        indent=2,
    )


print(json.dumps(analysis))
