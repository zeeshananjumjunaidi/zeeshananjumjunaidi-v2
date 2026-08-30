// Bindings are `tab::output label`, resolved against the rendered tab, so any
// output any tab shows can be pinned to a node with no registry to maintain.
// Renaming an output orphans its bindings; those render as an em dash rather
// than vanishing, so the diagram says something is wrong instead of lying.
import { collectSection } from "./export.js";

var TABS = ["traffic", "storage", "cache", "bandwidth", "compute", "database", "queue", "latency", "availability", "cost"];

// Node captions are tight, so the busiest outputs get a hand-written short
// form. Anything not listed falls back to its own label, lowercased.
var SHORTS = {
  "Peak requests per second": "peak RPS",
  "Peak read RPS": "read RPS",
  "Peak write RPS": "write RPS",
  "Servers to provision": "servers",
  "Servers to serve peak": "servers at peak",
  "Throughput per server": "per server",
  "Memory needed, with replicas": "cache mem",
  "Memory needed, raw": "cache mem, raw",
  "Cache nodes needed": "cache nodes",
  "Reads that still reach the database": "db reads",
  "Total nodes with replicas": "db nodes",
  "Data per shard": "per shard",
  "Origin read RPS after CDN": "origin RPS",
  "Egress per month": "egress/mo",
  "Ingress per month": "ingress/mo",
  "First-year footprint": "storage y1",
  "Consumer instances": "consumers",
  "Broker storage": "broker disk",
  "Time to drain after outage": "drain time"
};

// The spike stored a short key. Kept so diagrams saved then still resolve.
var LEGACY = {
  peakRps: "traffic::Peak requests per second",
  readRps: "traffic::Peak read RPS",
  writeRps: "traffic::Peak write RPS",
  servers: "compute::Servers to provision",
  cacheMem: "cache::Memory needed, with replicas",
  dbReads: "cache::Reads that still reach the database",
  shards: "database::Shards",
  egress: "bandwidth::Egress per month",
  storageY1: "storage::First-year footprint",
  partitions: "queue::Partitions"
};

export function canonicalId(id) {
  if (!id) return null;
  return LEGACY[id] || id;
}

function parseId(id) {
  var canon = canonicalId(id);
  if (!canon) return null;
  var at = canon.indexOf("::");
  if (at === -1) return null;
  return { tab: canon.slice(0, at), label: canon.slice(at + 2) };
}

export function shortFor(label) {
  return SHORTS[label] || label.toLowerCase();
}

// Every output the calculator is currently showing, grouped by tab.
export function catalogue() {
  var groups = [];
  TABS.forEach(function (tab) {
    var section = collectSection(tab);
    if (!section) return;
    var items = [];
    section.panels.forEach(function (panel) {
      panel.outputs.forEach(function (o) {
        items.push({
          id: tab + "::" + o.label,
          tab: tab, label: o.label, panel: panel.title,
          value: o.value, unit: o.unit, short: shortFor(o.label)
        });
      });
    });
    if (items.length) groups.push({ tab: tab, title: section.title, items: items });
  });
  return groups;
}

export function readMetric(id) {
  var def = parseId(id);
  if (!def) return null;
  var short = shortFor(def.label);
  var section = collectSection(def.tab);
  if (section) {
    for (var i = 0; i < section.panels.length; i++) {
      var outs = section.panels[i].outputs;
      for (var j = 0; j < outs.length; j++) {
        if (outs[j].label === def.label) {
          return { short: short, label: def.label, tab: def.tab, value: outs[j].value, unit: outs[j].unit };
        }
      }
    }
  }
  return { short: short, label: def.label, tab: def.tab, value: "—", unit: "" };
}

// What actually goes on the node: a value and a caption, with the unit dropped
// when the caption already carries it ("34,378 RPS read RPS" reads badly).
export function formatMetric(id) {
  var m = readMetric(id);
  if (!m) return null;
  var unit = m.unit;
  var short = m.short;
  if (unit && short.toLowerCase().indexOf(unit.toLowerCase()) !== -1) unit = "";
  if (m.value === "1" && /[^s]s$/.test(short)) short = short.slice(0, -1);
  return { value: m.value + (unit ? " " + unit : ""), short: short, label: m.label };
}
