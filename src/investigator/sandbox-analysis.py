import json
import sys

incident = json.load(sys.stdin)

required = [
    "incident_id",
    "service",
    "severity",
    "status",
    "suspected_component",
]

if any(field not in incident for field in required):
    sys.exit(1)

analysis = {
    "incident": incident,
    "root_cause_candidate": incident["suspected_component"],
}

with open("analysis.json", "w") as f:
    json.dump(analysis, f)

print(json.dumps(analysis))