import { n, fmt, numPreview, bytes, toggle } from "./format.js";
import { deriveTraffic } from "./traffic.js";

// Storage optionally reads writesDay off Traffic (the "linked" toggle), so it
// takes Traffic's derived numbers as an input rather than deriving them itself.
export function deriveStorage(s, trafficD) {
  var d = {};
  d.stWrites = s.stLink ? trafficD.writesDay : n(s.stWrites);
  d.rawDay = d.stWrites * n(s.wbytes);
  d.effDay = (d.rawDay / Math.max(n(s.comp), 1)) * (1 + n(s.idxPct) / 100);
  d.y1 = d.effDay * 365;
  var g = n(s.growth) / 100;
  var Y = Math.max(n(s.years), 0);
  d.logical = g > 0 ? d.y1 * ((Math.pow(1 + g, Y) - 1) / g) : d.y1 * Y;
  var repl = Math.max(n(s.repl), 1);
  d.physical = d.logical * repl;
  d.physDay = d.effDay * repl;
  d.physMonth = d.physDay * 30;
  d.objects = d.stWrites * 365 * Y;
  return d;
}

var DEFAULTS = { stWrites: "2000000", wbytes: "1024", comp: "2", idxPct: "25", repl: "3", years: "5", growth: "30" };
var IDS = ["stWrites", "wbytes", "comp", "idxPct", "repl", "years", "growth"];

export function initStorage(trafficState, onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });
  var linkEl = document.getElementById("stLink");
  var writesField = document.getElementById("stWritesField");
  var linkedNote = document.getElementById("stLinkedNote");

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    s.stLink = linkEl.checked;
    return s;
  }

  function render() {
    var trafficD = deriveTraffic(trafficState());
    var s = state();
    var d = deriveStorage(s, trafficD);

    document.getElementById("stLinkedValue").textContent = fmt(trafficD.writesDay);
    document.getElementById("idxPctVal").textContent = s.idxPct;
    document.getElementById("growthVal").textContent = s.growth;
    document.getElementById("stYearsLabel").textContent = n(s.years);
    document.getElementById("stWritesPreview").textContent = numPreview(d.stWrites);
    document.getElementById("wbytesPreview").textContent = numPreview(n(s.wbytes));

    document.getElementById("out-physical").textContent = bytes(d.physical);
    document.getElementById("out-logical").textContent = bytes(d.logical);
    document.getElementById("out-y1").textContent = bytes(d.y1);
    document.getElementById("out-rawDay").textContent = bytes(d.rawDay);
    document.getElementById("out-physDay").textContent = bytes(d.physDay);
    document.getElementById("out-physMonth").textContent = bytes(d.physMonth);
    document.getElementById("out-objects").textContent = fmt(d.objects);

    toggle("flag-petabyte", d.physical > 1e15);
    toggle("flag-billionrows", d.objects > 1e11);

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
    linkEl.checked = true;
    writesField.hidden = true;
    linkedNote.hidden = false;
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });
  linkEl.addEventListener("change", function () {
    writesField.hidden = linkEl.checked;
    linkedNote.hidden = !linkEl.checked;
    render();
  });
  writesField.hidden = linkEl.checked;
  linkedNote.hidden = !linkEl.checked;

  return { state: state, render: render, reset: reset };
}
