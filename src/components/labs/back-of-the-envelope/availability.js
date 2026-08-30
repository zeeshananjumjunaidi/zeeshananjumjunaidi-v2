import { n, fmt, dur, setTone } from "./format.js";
import { deriveTraffic } from "./traffic.js";

function clampPct(x) { return Math.min(Math.max(x, 0), 100); }

export function deriveAvailability(s, trafficD) {
  var d = {};
  var A = clampPct(n(s.slo)) / 100;
  d.slo = A;
  d.downYear = (1 - A) * 31536000;
  d.downMonth = (1 - A) * 2592000;
  d.downWeek = (1 - A) * 604800;
  d.downDay = (1 - A) * 86400;

  var ca = clampPct(n(s.compAvail)) / 100;
  d.series = Math.pow(ca, Math.max(n(s.compCount), 1));
  d.parallel = 1 - Math.pow(1 - ca, Math.max(n(s.redundancy), 1));
  d.budgetReq = trafficD.reqMonth * (1 - A);
  d.mtbfA = n(s.mtbf) / Math.max(n(s.mtbf) + n(s.mttr), 0.0001);
  return d;
}

var DEFAULTS = { slo: "99.9", compCount: "5", compAvail: "99.95", redundancy: "2", mtbf: "2000", mttr: "2" };
var IDS = ["slo", "compCount", "compAvail", "redundancy", "mtbf", "mttr"];
var NINES = [90, 99, 99.9, 99.95, 99.99, 99.999];

export function initAvailability(trafficState, onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    return s;
  }

  function render() {
    var trafficD = deriveTraffic(trafficState());
    var s = state();
    var d = deriveAvailability(s, trafficD);

    document.getElementById("out-downYear").firstChild.textContent = dur(d.downYear);
    setTone("out-downYear", d.downYear > 86400 ? "bad" : "ok");
    document.getElementById("out-downMonth").textContent = dur(d.downMonth);
    document.getElementById("out-downWeek").textContent = dur(d.downWeek);
    document.getElementById("out-downDay").textContent = dur(d.downDay);
    document.getElementById("out-budgetReq").firstChild.textContent = fmt(d.budgetReq);

    document.getElementById("out-series").firstChild.textContent = (d.series * 100).toFixed(4);
    setTone("out-series", d.series < d.slo ? "bad" : "ok");
    document.getElementById("out-seriesDownYear").textContent = dur((1 - d.series) * 31536000);
    document.getElementById("out-slomet").textContent = d.series >= d.slo ? "yes" : "no";
    setTone("out-slomet", d.series >= d.slo ? "ok" : "bad");

    document.getElementById("out-parallel").firstChild.textContent = (d.parallel * 100).toFixed(5);
    document.getElementById("out-parallelDownYear").textContent = dur((1 - d.parallel) * 31536000);

    document.getElementById("out-mtbfA").firstChild.textContent = (d.mtbfA * 100).toFixed(4);
    document.getElementById("out-mtbfDownYear").textContent = dur((1 - d.mtbfA) * 31536000);

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });

  // No input dependency, so it's built once rather than every render().
  var refBody = document.getElementById("availRefBody");
  NINES.forEach(function (x) {
    var f = 1 - x / 100;
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td>" + x + "%</td><td>" + dur(f * 31536000) + "</td><td>" + dur(f * 2592000) + "</td><td>" + dur(f * 86400) + "</td>";
    refBody.appendChild(tr);
  });

  return { state: state, render: render, reset: reset };
}
