// Runs the capacity engine checks in node.
//
// These used to be reachable from a button in the lab toolbar, which meant
// shipping the suite to every visitor. It is a development tool, so it lives
// here instead: pnpm test.

import { runTests } from "../src/components/labs/back-of-the-envelope/engine.test.js";

const results = runTests();
const failed = results.filter((r) => !r.pass);

for (const r of results) {
  console.log((r.pass ? "  ok   " : "  FAIL ") + r.name + (r.note ? "   " + r.note : ""));
}

console.log(
  failed.length
    ? `\n${failed.length} of ${results.length} checks failing`
    : `\nall ${results.length} checks passed`
);

process.exit(failed.length ? 1 : 0);
