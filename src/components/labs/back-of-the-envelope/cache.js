import { n, fmt, int, numPreview, bytes, toggle } from "./format.js";
import { deriveTraffic } from "./traffic.js";
import { deriveStorage } from "./storage.js";

// Cache optionally reads peak read RPS off Traffic and total data size off
// Storage, same "linked" pattern Storage itself uses for writes/day.
export function deriveCache(s, trafficD, storageD) {
  var d = {};
  d.peakReadRps = s.cacheLink ? trafficD.peakReadRps : n(s.cacheReads);
  d.hitRatio = n(s.hitRatio) / 100;
  d.hitRps = d.peakReadRps * d.hitRatio;
  d.missRps = d.peakReadRps * (1 - d.hitRatio);

  d.totalDataBytes = s.cacheDataLink ? storageD.logical : n(s.cacheDataManual) * Math.pow(1024, 3);
  d.workingPct = n(s.workingPct) / 100;
  d.workingSet = d.totalDataBytes * d.workingPct;

  var itemBytes = Math.max(n(s.cacheItemBytes), 1);
  d.cacheItems = d.workingSet / itemBytes;

  var overhead = Math.max(n(s.cacheOverhead), 1);
  d.memRaw = d.workingSet * overhead;
  var repl = Math.max(n(s.cacheRepl), 1);
  d.memTotal = d.memRaw * repl;

  var nodeBytes = Math.max(n(s.cacheNodeGB), 0.001) * Math.pow(1024, 3);
  d.nodes = d.memTotal > 0 ? Math.ceil(d.memTotal / nodeBytes) : 0;
  return d;
}

var DEFAULTS = { cacheReads: "5000", hitRatio: "80", cacheDataManual: "500", workingPct: "20", cacheItemBytes: "2048", cacheOverhead: "1.3", cacheRepl: "2", cacheNodeGB: "24" };
var IDS = ["cacheReads", "hitRatio", "cacheDataManual", "workingPct", "cacheItemBytes", "cacheOverhead", "cacheRepl", "cacheNodeGB"];

export function initCache(trafficState, storageState, onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });
  var linkEl = document.getElementById("cacheLink");
  var readsField = document.getElementById("cacheReadsField");
  var linkedNote = document.getElementById("cacheLinkedNote");
  var dataLinkEl = document.getElementById("cacheDataLink");
  var dataField = document.getElementById("cacheDataField");
  var dataLinkedNote = document.getElementById("cacheDataLinkedNote");

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    s.cacheLink = linkEl.checked;
    s.cacheDataLink = dataLinkEl.checked;
    return s;
  }

  function render() {
    var trafficD = deriveTraffic(trafficState());
    var storageD = deriveStorage(storageState(), trafficD);
    var s = state();
    var d = deriveCache(s, trafficD, storageD);

    document.getElementById("cacheLinkedValue").textContent = int(trafficD.peakReadRps);
    document.getElementById("cacheDataLinkedValue").textContent = bytes(storageD.logical);
    document.getElementById("hitRatioVal").textContent = s.hitRatio;
    document.getElementById("workingPctVal").textContent = s.workingPct;
    document.getElementById("cacheReadsPreview").textContent = numPreview(n(s.cacheReads));
    document.getElementById("cacheItemBytesPreview").textContent = numPreview(n(s.cacheItemBytes));

    document.getElementById("out-cacheHitRps").firstChild.textContent = int(d.hitRps);
    document.getElementById("out-cacheMissRps").firstChild.textContent = int(d.missRps);
    document.getElementById("out-cacheReduction").textContent = d.peakReadRps > 0 ? (d.hitRatio * 100).toFixed(0) + "% fewer reads reach the database" : "—";

    document.getElementById("out-cacheNodes").textContent = isFinite(d.nodes) ? d.nodes.toLocaleString("en-US") : "—";
    document.getElementById("out-cacheMemTotal").textContent = bytes(d.memTotal);
    document.getElementById("out-cacheMemRaw").textContent = bytes(d.memRaw);
    document.getElementById("out-workingSet").textContent = bytes(d.workingSet);
    document.getElementById("out-cacheItems").textContent = fmt(d.cacheItems);

    toggle("flag-cache-lowhit", d.peakReadRps > 0 && d.hitRatio < 0.5);
    toggle("flag-cache-fleet", d.nodes > 20);

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
    linkEl.checked = true;
    readsField.hidden = true;
    linkedNote.hidden = false;
    dataLinkEl.checked = true;
    dataField.hidden = true;
    dataLinkedNote.hidden = false;
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });
  linkEl.addEventListener("change", function () {
    readsField.hidden = linkEl.checked;
    linkedNote.hidden = !linkEl.checked;
    render();
  });
  dataLinkEl.addEventListener("change", function () {
    dataField.hidden = dataLinkEl.checked;
    dataLinkedNote.hidden = !dataLinkEl.checked;
    render();
  });
  readsField.hidden = linkEl.checked;
  linkedNote.hidden = !linkEl.checked;
  dataField.hidden = dataLinkEl.checked;
  dataLinkedNote.hidden = !dataLinkEl.checked;

  return { state: state, render: render, reset: reset };
}
