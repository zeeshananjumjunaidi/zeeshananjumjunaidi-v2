import { n, fmt, int, numPreview, bytes, bitrate, dur, toggle, setTone } from "./format.js";
import { deriveTraffic } from "./traffic.js";

// Queue links its peak message rate off Traffic's peak write RPS -- in most
// event-driven systems a write becomes a message roughly 1:1.
export function deriveQueue(s, trafficD) {
  var d = {};
  d.qRate = s.queueLink ? trafficD.peakWriteRps : n(s.msgRate);
  d.qBps = d.qRate * n(s.msgBytes);
  d.qRepl = Math.max(n(s.qRepl), 1);
  d.qStore = d.qBps * Math.max(n(s.retH), 0) * 3600 * d.qRepl;

  var partMBps = Math.max(n(s.partMBps), 0.01);
  d.partsThroughput = d.qBps > 0 ? Math.ceil(d.qBps / 1e6 / partMBps) : 0;
  var consRate = Math.max(n(s.consRate), 1);
  d.consumers = d.qRate > 0 ? Math.ceil(d.qRate / consRate) : 0;
  d.partitions = Math.max(1, d.partsThroughput, d.consumers);

  d.backlog = d.qRate * n(s.outageMin) * 60;
  d.drainCap = d.consumers * consRate - d.qRate;
  d.drain = d.drainCap > 0 ? d.backlog / d.drainCap : Infinity;
  d.qNet = d.qBps * (d.qRepl + 1);
  return d;
}

var DEFAULTS = { msgRate: "200000", msgBytes: "512", retH: "72", qRepl: "3", partMBps: "10", consRate: "8000", outageMin: "30" };
var IDS = ["msgRate", "msgBytes", "retH", "qRepl", "partMBps", "consRate", "outageMin"];

export function initQueue(trafficState, onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });
  var linkEl = document.getElementById("queueLink");
  var rateField = document.getElementById("msgRateField");
  var linkedNote = document.getElementById("queueLinkedNote");

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    s.queueLink = linkEl.checked;
    return s;
  }

  function render() {
    var trafficD = deriveTraffic(trafficState());
    var s = state();
    var d = deriveQueue(s, trafficD);

    document.getElementById("queueLinkedValue").textContent = int(trafficD.peakWriteRps);
    document.getElementById("msgRatePreview").textContent = numPreview(n(s.msgRate));
    document.getElementById("msgBytesPreview").textContent = numPreview(n(s.msgBytes));

    document.getElementById("out-partitions").textContent = int(d.partitions);
    document.getElementById("out-qBps").textContent = bytes(d.qBps) + "/s";
    document.getElementById("out-qNet").textContent = bitrate(d.qNet * 8);
    document.getElementById("out-consumers").textContent = int(d.consumers);
    document.getElementById("out-qStore").textContent = bytes(d.qStore);

    var drainOk = isFinite(d.drain) && d.drain <= 3600;
    document.getElementById("out-drain").textContent = isFinite(d.drain) ? dur(d.drain) : "never";
    setTone("out-drain", drainOk ? "ok" : "bad");
    document.getElementById("out-backlog").textContent = fmt(d.backlog) + " msgs";
    document.getElementById("out-backlogFormula").textContent = "rate × " + n(s.outageMin) + " min";
    document.getElementById("out-backlogBytes").textContent = bytes(d.backlog * n(s.msgBytes));
    document.getElementById("out-drainCap").textContent = d.drainCap > 0 ? fmt(d.drainCap) + " msg/s" : "none";
    setTone("out-drainCap", d.drainCap > 0 ? "ok" : "bad");

    toggle("flag-queue-drain", !isFinite(d.drain));

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
    linkEl.checked = true;
    rateField.hidden = true;
    linkedNote.hidden = false;
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });
  linkEl.addEventListener("change", function () {
    rateField.hidden = linkEl.checked;
    linkedNote.hidden = !linkEl.checked;
    render();
  });
  rateField.hidden = linkEl.checked;
  linkedNote.hidden = !linkEl.checked;

  return { state: state, render: render, reset: reset };
}
