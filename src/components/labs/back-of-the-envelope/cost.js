import { n, int, bytes, setTone, toggle } from "./format.js";
import { deriveTraffic } from "./traffic.js";
import { deriveStorage } from "./storage.js";
import { deriveCache } from "./cache.js";
import { deriveBandwidth } from "./bandwidth.js";
import { deriveCompute } from "./compute.js";
import { deriveDatabase } from "./database.js";

function money(x) {
  if (!isFinite(x)) return "—";
  var a = Math.abs(x);
  if (a >= 1000) return "$" + Math.round(x).toLocaleString("en-US");
  if (a >= 1) return "$" + x.toFixed(2);
  return "$" + x.toFixed(4);
}

var GB = 1e9;

// Unit price x quantity from an earlier tab. No tiers or per-provider SKUs:
// the point is which line dominates, not an accurate bill.
export function deriveCost(s, trafficD, computeD, databaseD, cacheD, storageD, bandwidthD) {
  var d = {};
  d.cServer = computeD.serversAz * n(s.pServer) * 730;
  d.cDb = databaseD.dbNodes * n(s.pDbHr) * 730;
  d.cCache = (cacheD.memTotal / GB) * n(s.pCacheGB);
  d.cStorage = (storageD.physical / GB) * n(s.pStorage);
  d.cEgress = (bandwidthD.egressBytesMonth / GB) * n(s.pEgress);
  d.cTotal = d.cServer + d.cDb + d.cCache + d.cStorage + d.cEgress;
  d.cPerUser = trafficD.dau > 0 ? d.cTotal / trafficD.dau : 0;
  d.cPerM = trafficD.reqMonth > 0 ? d.cTotal / (trafficD.reqMonth / 1e6) : 0;
  d.cPerGB = bandwidthD.egressBytesMonth > 0 ? d.cTotal / (bandwidthD.egressBytesMonth / GB) : 0;
  return d;
}

var DEFAULTS = { pServer: "0.35", pDbHr: "0.60", pCacheGB: "0.045", pStorage: "0.023", pEgress: "0.08" };
var IDS = ["pServer", "pDbHr", "pCacheGB", "pStorage", "pEgress"];
var ROWS = [
  { key: "cServer", label: "Application servers", out: "out-cServer", sub: function (computeD) { return int(computeD.serversAz) + " x 730 h"; } },
  { key: "cDb", label: "Database nodes", out: "out-cDb", sub: function (computeD, databaseD) { return int(databaseD.dbNodes) + " x 730 h"; } },
  { key: "cCache", label: "Cache memory", out: "out-cCache", sub: function (computeD, databaseD, cacheD) { return bytes(cacheD.memTotal); } },
  { key: "cStorage", label: "Storage", out: "out-cStorage", sub: function (computeD, databaseD, cacheD, storageD) { return bytes(storageD.physical); } },
  { key: "cEgress", label: "Egress", out: "out-cEgress", sub: function (computeD, databaseD, cacheD, storageD, bandwidthD) { return bytes(bandwidthD.egressBytesMonth); } }
];

export function initCost(trafficState, computeState, databaseState, cacheState, storageState, bandwidthState, onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    return s;
  }

  function render() {
    var trafficD = deriveTraffic(trafficState());
    var storageD = deriveStorage(storageState(), trafficD);
    var cacheD = deriveCache(cacheState(), trafficD, storageD);
    var bandwidthD = deriveBandwidth(bandwidthState(), trafficD);
    var computeD = deriveCompute(computeState(), trafficD);
    var databaseD = deriveDatabase(databaseState(), trafficD, storageD);
    var s = state();
    var d = deriveCost(s, trafficD, computeD, databaseD, cacheD, storageD, bandwidthD);

    document.getElementById("out-cTotal").firstChild.textContent = money(d.cTotal);
    ROWS.forEach(function (row) {
      var v = d[row.key];
      var pct = d.cTotal > 0 ? (v / d.cTotal) * 100 : 0;
      var el = document.getElementById(row.out);
      el.firstChild.textContent = money(v);
      setTone(row.out, pct > 50 ? "bad" : "");
      document.getElementById(row.out + "-sub").textContent = row.sub(computeD, databaseD, cacheD, storageD, bandwidthD) + " · " + pct.toFixed(1) + "% of spend";
    });
    document.getElementById("out-cPerYear").textContent = money(d.cTotal * 12);

    document.getElementById("out-cPerUser").firstChild.textContent = money(d.cPerUser);
    document.getElementById("out-cPerM").textContent = money(d.cPerM);
    document.getElementById("out-cPerGB").textContent = money(d.cPerGB);

    toggle("flag-cost-high", d.cPerUser > 0.5);

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });

  return { state: state, render: render, reset: reset };
}
