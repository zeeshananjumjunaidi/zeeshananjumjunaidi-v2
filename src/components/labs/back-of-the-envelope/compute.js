import { n, int, numPreview, toggle, setTone } from "./format.js";
import { deriveTraffic } from "./traffic.js";

export function deriveCompute(s, trafficD) {
  var d = {};
  d.peakRps = s.cpLink ? trafficD.peakRps : n(s.cpReq);

  d.perCore = 1000 / Math.max(n(s.cpuMs), 0.001);
  d.utilF = Math.max(Math.min(n(s.util), 100), 0) / 100;
  var cores = Math.max(n(s.cores), 1);
  d.perServer = d.perCore * cores * d.utilF;
  d.servers = d.peakRps > 0 ? Math.ceil(d.peakRps / Math.max(d.perServer, 0.0001)) : 0;
  d.az = Math.max(n(s.az), 1);
  d.serversAz = d.az > 1 ? Math.ceil(d.servers * (d.az / (d.az - 1))) : d.servers;
  d.concurrency = d.peakRps * (n(s.svcMs) / 1000);
  d.threadsPerServer = d.serversAz > 0 ? Math.ceil(d.concurrency / d.serversAz) : 0;
  d.qMult = d.utilF < 1 ? 1 / (1 - d.utilF) : Infinity;
  d.headroom = d.perServer * d.serversAz;
  return d;
}

var DEFAULTS = { cpReq: "7000", cpuMs: "20", svcMs: "80", cores: "8", util: "60", az: "3" };
var IDS = ["cpReq", "cpuMs", "svcMs", "cores", "util", "az"];
var UTIL_STEPS = [50, 60, 70, 80, 90, 95, 99];

export function initCompute(trafficState, onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });
  var linkEl = document.getElementById("cpLink");
  var reqField = document.getElementById("cpReqField");
  var linkedNote = document.getElementById("cpLinkedNote");

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    s.cpLink = linkEl.checked;
    return s;
  }

  function render() {
    var trafficD = deriveTraffic(trafficState());
    var s = state();
    var d = deriveCompute(s, trafficD);

    document.getElementById("cpLinkedValue").textContent = int(trafficD.peakRps);
    document.getElementById("utilVal").textContent = s.util;
    document.getElementById("cpReqPreview").textContent = numPreview(n(s.cpReq));

    document.getElementById("out-serversAz").textContent = int(d.serversAz);
    document.getElementById("out-servers").textContent = int(d.servers);
    document.getElementById("out-perServer").firstChild.textContent = int(d.perServer);
    document.getElementById("out-perServerFormula").textContent =
      int(d.perCore) + " RPS/core × " + n(s.cores) + " cores × " + n(s.util) + "%";
    document.getElementById("out-headroom").firstChild.textContent = int(d.headroom);
    setTone("out-headroom", d.headroom >= d.peakRps ? "ok" : "bad");

    document.getElementById("out-concurrency").textContent = int(d.concurrency);
    document.getElementById("out-threadsPerServer").textContent = int(d.threadsPerServer);
    document.getElementById("out-qMult").textContent = isFinite(d.qMult) ? d.qMult.toFixed(1) + "×" : "∞";
    setTone("out-qMult", d.qMult > 4 ? "bad" : "ok");

    var perCore = d.perCore, cores = Math.max(n(s.cores), 1);
    var refBody = document.getElementById("utilRefBody");
    refBody.innerHTML = "";
    UTIL_STEPS.forEach(function (u) {
      var perServerAtU = perCore * cores * (u / 100);
      var serversAtU = d.peakRps > 0 ? Math.ceil(d.peakRps / Math.max(perServerAtU, 0.0001)) : 0;
      var mult = 1 / (1 - u / 100);
      var tr = document.createElement("tr");
      tr.innerHTML = "<td>" + u + "%</td><td>" + mult.toFixed(1) + "×</td><td>" + int(serversAtU) + "</td>";
      refBody.appendChild(tr);
    });

    toggle("flag-compute-util", n(s.util) > 80);

    if (onChange) onChange();
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
    linkEl.checked = true;
    reqField.hidden = true;
    linkedNote.hidden = false;
  }

  IDS.forEach(function (id) { els[id].addEventListener("input", render); });
  linkEl.addEventListener("change", function () {
    reqField.hidden = linkEl.checked;
    linkedNote.hidden = !linkEl.checked;
    render();
  });
  reqField.hidden = linkEl.checked;
  linkedNote.hidden = !linkEl.checked;

  return { state: state, render: render, reset: reset };
}
