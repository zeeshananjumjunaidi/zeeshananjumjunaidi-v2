import { n, fmt, int, numPreview, bytes, toggle, setTone } from "./format.js";
import { deriveTraffic } from "./traffic.js";
import { deriveStorage } from "./storage.js";

// Database's dataset/QPS optionally read off Storage (objects stored) and
// Traffic (peak RPS), same "linked" pattern as the tabs before it.
export function deriveDatabase(s, trafficD, storageD) {
  var d = {};
  d.records = s.dbRecordsLink ? storageD.objects : n(s.dbRecords);
  d.dataset = d.records * n(s.recBytes) * (1 + n(s.dbIdx) / 100);

  var shardCap = Math.max(n(s.shardCapGB), 1) * Math.pow(1024, 3);
  d.shardsStorage = d.dataset > 0 ? Math.ceil(d.dataset / shardCap) : 0;

  d.dbQps = s.dbQpsLink ? trafficD.peakRps : n(s.dbQps);
  var shardQps = Math.max(n(s.shardQps), 1);
  d.shardsQps = d.dbQps > 0 ? Math.ceil(d.dbQps / shardQps) : 0;

  d.shards = Math.max(1, d.shardsStorage, d.shardsQps);
  d.dbRepl = Math.max(n(s.dbRepl), 0);
  d.dbNodes = d.shards * (1 + d.dbRepl);

  d.perShardBytes = d.dataset / d.shards;
  d.perShardRows = d.records / d.shards;
  d.perShardQps = d.dbQps / d.shards;
  d.hotShardQps = d.perShardQps * 5;
  return d;
}

var DEFAULTS = { dbRecords: "20000000000", recBytes: "512", dbIdx: "30", dbQps: "7000", shardCapGB: "2000", shardQps: "20000", dbRepl: "2" };
var IDS = ["dbRecords", "recBytes", "dbIdx", "dbQps", "shardCapGB", "shardQps", "dbRepl"];

export function initDatabase(trafficState, storageState, onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });
  var recordsLinkEl = document.getElementById("dbRecordsLink");
  var recordsField = document.getElementById("dbRecordsField");
  var recordsLinkedNote = document.getElementById("dbRecordsLinkedNote");
  var qpsLinkEl = document.getElementById("dbQpsLink");
  var qpsField = document.getElementById("dbQpsField");
  var qpsLinkedNote = document.getElementById("dbQpsLinkedNote");

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    s.dbRecordsLink = recordsLinkEl.checked;
    s.dbQpsLink = qpsLinkEl.checked;
    return s;
  }

  function render() {
    var trafficD = deriveTraffic(trafficState());
    var storageD = deriveStorage(storageState(), trafficD);
    var s = state();
    var d = deriveDatabase(s, trafficD, storageD);

    document.getElementById("dbRecordsLinkedValue").textContent = fmt(storageD.objects);
    document.getElementById("dbQpsLinkedValue").textContent = int(trafficD.peakRps);
    document.getElementById("dbIdxVal").textContent = s.dbIdx;
    document.getElementById("dbRecordsPreview").textContent = numPreview(n(s.dbRecords));
    document.getElementById("recBytesPreview").textContent = numPreview(n(s.recBytes));
    document.getElementById("dbQpsPreview").textContent = numPreview(n(s.dbQps));
    document.getElementById("shardQpsPreview").textContent = numPreview(n(s.shardQps));

    document.getElementById("out-shards").textContent = int(d.shards);
    document.getElementById("out-shardsStorage").textContent = int(d.shardsStorage);
    document.getElementById("out-shardsQps").textContent = int(d.shardsQps);
    var storageBound = d.shardsStorage >= d.shardsQps;
    setTone("out-shardsStorage", storageBound ? "bad" : null);
    document.getElementById("out-shardsStorageSub").textContent = storageBound ? "This is your binding constraint" : "";
    setTone("out-shardsQps", !storageBound ? "bad" : null);
    document.getElementById("out-shardsQpsSub").textContent = !storageBound ? "This is your binding constraint" : "";
    document.getElementById("out-dbNodes").textContent = int(d.dbNodes);
    document.getElementById("out-dbNodesFormula").textContent = "shards × (1 + " + n(s.dbRepl) + ")";

    document.getElementById("out-perShardBytes").textContent = bytes(d.perShardBytes);
    document.getElementById("out-perShardRows").textContent = fmt(d.perShardRows);
    document.getElementById("out-perShardQps").textContent = int(d.perShardQps);
    document.getElementById("out-hotShardQps").textContent = int(d.hotShardQps);
    var hotExceeds = d.hotShardQps > Math.max(n(s.shardQps), 1);
    setTone("out-hotShardQps", hotExceeds ? "bad" : "ok");
    document.getElementById("out-hotShardQpsSub").textContent = hotExceeds
      ? "Exceeds a single node's budget, you need a hot-key strategy"
      : "Within a single node's budget";
    document.getElementById("out-dataset").textContent = bytes(d.dataset);

    toggle("flag-database-shards", d.shards > 1000);

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
    recordsLinkEl.checked = true;
    recordsField.hidden = true;
    recordsLinkedNote.hidden = false;
    qpsLinkEl.checked = true;
    qpsField.hidden = true;
    qpsLinkedNote.hidden = false;
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });
  recordsLinkEl.addEventListener("change", function () {
    recordsField.hidden = recordsLinkEl.checked;
    recordsLinkedNote.hidden = !recordsLinkEl.checked;
    render();
  });
  qpsLinkEl.addEventListener("change", function () {
    qpsField.hidden = qpsLinkEl.checked;
    qpsLinkedNote.hidden = !qpsLinkEl.checked;
    render();
  });
  recordsField.hidden = recordsLinkEl.checked;
  recordsLinkedNote.hidden = !recordsLinkEl.checked;
  qpsField.hidden = qpsLinkEl.checked;
  qpsLinkedNote.hidden = !qpsLinkEl.checked;

  return { state: state, render: render, reset: reset };
}
