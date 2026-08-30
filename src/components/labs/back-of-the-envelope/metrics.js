// A curated handful rather than every output, to find out whether pinning live
// numbers onto diagram nodes is worth building out properly. The join key is
// the output's rendered label, so renaming one orphans its binding.
import { collectSection } from "./export.js";

export var METRICS = [
  { key: "peakRps", tab: "traffic", label: "Peak requests per second", short: "peak RPS" },
  { key: "readRps", tab: "traffic", label: "Peak read RPS", short: "read RPS" },
  { key: "writeRps", tab: "traffic", label: "Peak write RPS", short: "write RPS" },
  { key: "servers", tab: "compute", label: "Servers to provision", short: "servers" },
  { key: "cacheMem", tab: "cache", label: "Memory needed, with replicas", short: "cache mem" },
  { key: "dbReads", tab: "cache", label: "Reads that still reach the database", short: "db reads" },
  { key: "shards", tab: "database", label: "Shards", short: "shards" },
  { key: "egress", tab: "bandwidth", label: "Egress per month", short: "egress/mo" },
  { key: "storageY1", tab: "storage", label: "First-year footprint", short: "storage y1" },
  { key: "partitions", tab: "queue", label: "Partitions", short: "partitions" }
];

var byKey = {};
METRICS.forEach(function (m) { byKey[m.key] = m; });

export function metricByKey(key) { return byKey[key] || null; }

// Read straight off the rendered tab, so a binding always shows whatever the
// calculator is showing right now.
export function readMetric(key) {
  var def = byKey[key];
  if (!def) return null;
  var section = collectSection(def.tab);
  if (!section) return { short: def.short, value: "—", unit: "" };
  for (var i = 0; i < section.panels.length; i++) {
    var outs = section.panels[i].outputs;
    for (var j = 0; j < outs.length; j++) {
      if (outs[j].label === def.label) {
        return { short: def.short, value: outs[j].value, unit: outs[j].unit };
      }
    }
  }
  return { short: def.short, value: "—", unit: "" };
}
