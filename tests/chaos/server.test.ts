import test from "node:test";
import assert from "node:assert/strict";

import {
  executeChaosLookup,
} from "../../tools/chaos-mcp/chaos.js";

test(
  "malformed-result mode never returns parseable incident evidence",
  async () => {
    const result =
      await executeChaosLookup(
        "INC-042",
        "malformed-result",
        0,
      );

    assert.equal(
      result.content.length,
      1,
    );

    const text =
      result.content[0]?.text;

    assert.equal(
      typeof text,
      "string",
    );

    assert.ok(text);

    assert.throws(
      () => JSON.parse(text),
      SyntaxError,
    );
  },
);

test(
  "timeout mode rejects instead of returning a successful incident result",
  async () => {
    await assert.rejects(
      executeChaosLookup(
        "INC-042",
        "timeout",
        1,
      ),
      /Chaos MCP timeout injected for incident INC-042/,
    );
  },
);