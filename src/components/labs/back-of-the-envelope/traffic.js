import { n, fmt, int, numPreview, toggle } from "./format.js";

export function deriveTraffic(s) {
  var d = {};
  d.dau = n(s.dau);
  d.reqDay = d.dau * n(s.rpu);
  d.rps = d.reqDay / 86400;
  d.peakF = Math.max(n(s.peak), 1);
  d.peakRps = d.rps * d.peakF;
  var rw = Math.max(n(s.rw), 0);
  d.rShare = rw / (rw + 1);
  d.wShare = 1 - d.rShare;
  d.peakReadRps = d.peakRps * d.rShare;
  d.peakWriteRps = d.peakRps * d.wShare;
  d.writesDay = d.reqDay * d.wShare;
  d.readsDay = d.reqDay * d.rShare;
  d.reqMonth = d.reqDay * 30;
  return d;
}

var DEFAULTS = { dau: "10000000", rpu: "20", peak: "3", rw: "100" };
var IDS = ["dau", "rpu", "peak", "rw"];

// onChange fires after every render so the orchestrator can cascade into the
// next tab in the chain (Traffic feeds nearly everything downstream).
export function initTraffic(onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    return s;
  }

  function render() {
    var s = state();
    var d = deriveTraffic(s);

    document.getElementById("peakVal").textContent = s.peak;
    document.getElementById("dauPreview").textContent = numPreview(d.dau);

    document.getElementById("out-peakRps").firstChild.textContent = int(d.peakRps);
    document.getElementById("out-rps").firstChild.textContent = int(d.rps);
    document.getElementById("out-reqDay").textContent = fmt(d.reqDay);
    document.getElementById("out-reqMonth").textContent = fmt(d.reqMonth);

    document.getElementById("out-peakReadRps").firstChild.textContent = int(d.peakReadRps);
    document.getElementById("out-peakWriteRps").firstChild.textContent = int(d.peakWriteRps);
    document.getElementById("out-writesDay").textContent = fmt(d.writesDay);
    document.getElementById("out-readsDay").textContent = fmt(d.readsDay);
    document.getElementById("out-rShare").textContent = (d.rShare * 100).toFixed(1) + "% of traffic";
    document.getElementById("out-wShare").textContent = (d.wShare * 100).toFixed(1) + "% of traffic";

    var rw = n(s.rw);
    toggle("flag-scale", d.peakRps > 100000);
    toggle("flag-readheavy", rw >= 50);
    toggle("flag-writeheavy", rw < 1 && rw >= 0);

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });

  return { state: state, render: render, reset: reset };
}
