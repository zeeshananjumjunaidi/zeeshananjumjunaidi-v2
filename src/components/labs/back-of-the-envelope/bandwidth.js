import { n, numPreview, bytes, bitrate, int, toggle } from "./format.js";
import { deriveTraffic } from "./traffic.js";

// Bandwidth links off Traffic's peak RPS directly (not Cache's miss rate) --
// every read response leaves your origin's network whether it was served
// from cache or from the database, CDN offload is the only thing here that
// removes traffic from your origin entirely.
export function deriveBandwidth(s, trafficD) {
  var d = {};
  d.peakReadRps = s.bwLink ? trafficD.peakReadRps : n(s.bwReads);
  d.peakWriteRps = s.bwLink ? trafficD.peakWriteRps : n(s.bwWrites);
  d.readsDay = s.bwLink ? trafficD.readsDay : d.peakReadRps * 86400;
  d.writesDay = s.bwLink ? trafficD.writesDay : d.peakWriteRps * 86400;

  var cdn = n(s.cdnPct) / 100;
  d.originReadRps = d.peakReadRps * (1 - cdn);
  var overhead = Math.max(n(s.bwOverhead), 1);
  var respBytes = Math.max(n(s.respBytes), 0);
  var reqBytes = Math.max(n(s.reqBytes), 0);

  d.egressBps = d.originReadRps * respBytes * 8 * overhead;
  d.ingressBps = d.peakWriteRps * reqBytes * 8 * overhead;
  d.totalBps = d.egressBps + d.ingressBps;

  var originReadsMonth = d.readsDay * (1 - cdn) * 30;
  var writesMonth = d.writesDay * 30;
  d.egressBytesMonth = originReadsMonth * respBytes * overhead;
  d.ingressBytesMonth = writesMonth * reqBytes * overhead;
  d.totalBytesMonth = d.egressBytesMonth + d.ingressBytesMonth;
  return d;
}

var DEFAULTS = { bwReads: "6000", bwWrites: "60", respBytes: "5120", reqBytes: "1024", cdnPct: "60", bwOverhead: "1.15" };
var IDS = ["bwReads", "bwWrites", "respBytes", "reqBytes", "cdnPct", "bwOverhead"];

export function initBandwidth(trafficState, onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });
  var linkEl = document.getElementById("bwLink");
  var readsField = document.getElementById("bwReadsField");
  var writesField = document.getElementById("bwWritesField");
  var linkedNote = document.getElementById("bwLinkedNote");

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    s.bwLink = linkEl.checked;
    return s;
  }

  function render() {
    var trafficD = deriveTraffic(trafficState());
    var s = state();
    var d = deriveBandwidth(s, trafficD);

    document.getElementById("bwLinkedValue").textContent = int(trafficD.peakReadRps);
    document.getElementById("bwLinkedWriteValue").textContent = int(trafficD.peakWriteRps);
    document.getElementById("cdnPctVal").textContent = s.cdnPct;
    document.getElementById("bwReadsPreview").textContent = numPreview(n(s.bwReads));
    document.getElementById("bwWritesPreview").textContent = numPreview(n(s.bwWrites));
    document.getElementById("respBytesPreview").textContent = numPreview(n(s.respBytes));
    document.getElementById("reqBytesPreview").textContent = numPreview(n(s.reqBytes));

    document.getElementById("out-bwTotal").textContent = bitrate(d.totalBps);
    document.getElementById("out-bwEgress").textContent = bitrate(d.egressBps);
    document.getElementById("out-bwIngress").textContent = bitrate(d.ingressBps);
    document.getElementById("out-bwOriginRps").firstChild.textContent = int(d.originReadRps);

    document.getElementById("out-bwTotalMonth").textContent = bytes(d.totalBytesMonth);
    document.getElementById("out-bwEgressMonth").textContent = bytes(d.egressBytesMonth);
    document.getElementById("out-bwIngressMonth").textContent = bytes(d.ingressBytesMonth);

    toggle("flag-bandwidth-heavy", d.totalBps > 5e9);
    toggle("flag-bandwidth-cost", d.totalBytesMonth > 1e15);

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
    linkEl.checked = true;
    readsField.hidden = true;
    writesField.hidden = true;
    linkedNote.hidden = false;
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });
  linkEl.addEventListener("change", function () {
    readsField.hidden = linkEl.checked;
    writesField.hidden = linkEl.checked;
    linkedNote.hidden = !linkEl.checked;
    render();
  });
  readsField.hidden = linkEl.checked;
  writesField.hidden = linkEl.checked;
  linkedNote.hidden = !linkEl.checked;

  return { state: state, render: render, reset: reset };
}
