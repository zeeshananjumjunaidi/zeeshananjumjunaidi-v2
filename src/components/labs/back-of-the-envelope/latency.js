import { n, setTone } from "./format.js";

export function deriveLatency(hops, s) {
  var d = {};
  d.total = hops.reduce(function (a, h) { return a + (h.on ? n(h.ms) * n(h.count) : 0); }, 0);
  var p = Math.min(Math.max(n(s.p99), 0), 100) / 100;
  var fanout = Math.max(n(s.fanout), 1);
  d.tailP = 1 - Math.pow(1 - p, fanout);
  return d;
}

var HOPS0 = [
  { id: 1, name: "Client → edge (RTT)", ms: "30", count: "1", on: true },
  { id: 2, name: "TLS handshake", ms: "60", count: "0", on: true },
  { id: 3, name: "Edge → origin region", ms: "40", count: "1", on: true },
  { id: 4, name: "Load balancer", ms: "1", count: "1", on: true },
  { id: 5, name: "Auth / token check", ms: "3", count: "1", on: true },
  { id: 6, name: "Cache lookup", ms: "1", count: "2", on: true },
  { id: 7, name: "Database query", ms: "15", count: "3", on: true },
  { id: 8, name: "Serialization", ms: "4", count: "1", on: true }
];
function cloneHops() {
  return HOPS0.map(function (h) { return { id: h.id, name: h.name, ms: h.ms, count: h.count, on: h.on }; });
}

var DEFAULTS = { fanout: "50", p99: "1" };
var IDS = ["fanout", "p99"];

// Rows are rebuilt only on add/delete/reset. Editing a hop updates the array
// and outputs without touching hopsList, so a row never loses focus mid-keystroke.
export function initLatency(onChange) {
  var els = {};
  IDS.forEach(function (id) { els[id] = document.getElementById(id); });
  var hopsList = document.getElementById("hopsList");
  var addBtn = document.getElementById("latencyAddHop");

  var hops = cloneHops();
  var nextId = 100;

  function state() {
    var s = {};
    IDS.forEach(function (id) { s[id] = els[id].value; });
    return s;
  }

  function render() {
    var s = state();
    var d = deriveLatency(hops, s);

    document.getElementById("out-latencyTotal").firstChild.textContent = d.total.toFixed(1);
    setTone("out-latencyTotal", d.total > 300 ? "bad" : "ok");

    document.getElementById("out-tailP").firstChild.textContent = (d.tailP * 100).toFixed(1);
    setTone("out-tailP", d.tailP > 0.3 ? "bad" : "ok");
    document.getElementById("out-tailOk").firstChild.textContent = ((1 - d.tailP) * 100).toFixed(1);

    if (onChange) onChange();
  }

  function buildRow(h) {
    var row = document.createElement("div");
    row.className = "boe-hop-row" + (h.on ? "" : " off");

    var check = document.createElement("input");
    check.type = "checkbox";
    check.className = "boe-hop-check";
    check.checked = h.on;
    check.addEventListener("change", function () {
      h.on = check.checked;
      row.classList.toggle("off", !h.on);
      render();
    });

    var name = document.createElement("input");
    name.type = "text";
    name.className = "boe-hop-name";
    name.value = h.name;
    name.addEventListener("input", function () { h.name = name.value; });

    var count = document.createElement("input");
    count.type = "number";
    count.min = "0";
    count.step = "any";
    count.className = "boe-hop-num";
    count.value = h.count;
    count.addEventListener("input", function () { h.count = count.value; render(); });

    var x = document.createElement("span");
    x.className = "boe-hop-x";
    x.textContent = "×";

    var ms = document.createElement("input");
    ms.type = "number";
    ms.min = "0";
    ms.step = "any";
    ms.className = "boe-hop-num";
    ms.value = h.ms;
    ms.addEventListener("input", function () { h.ms = ms.value; render(); });

    var unit = document.createElement("span");
    unit.className = "boe-hop-unit";
    unit.textContent = "ms";

    var del = document.createElement("button");
    del.type = "button";
    del.className = "boe-hop-del";
    del.setAttribute("aria-label", "Remove hop");
    del.textContent = "×";
    del.addEventListener("click", function () {
      hops = hops.filter(function (o) { return o.id !== h.id; });
      renderHops();
      render();
    });

    row.appendChild(check);
    row.appendChild(name);
    row.appendChild(count);
    row.appendChild(x);
    row.appendChild(ms);
    row.appendChild(unit);
    row.appendChild(del);
    return row;
  }

  function renderHops() {
    hopsList.innerHTML = "";
    hops.forEach(function (h) { hopsList.appendChild(buildRow(h)); });
  }

  function reset() {
    IDS.forEach(function (id) { els[id].value = DEFAULTS[id]; });
    hops = cloneHops();
    nextId = 100;
    renderHops();
  }

  addBtn.addEventListener("click", function () {
    hops.push({ id: nextId++, name: "New hop", ms: "10", count: "1", on: true });
    renderHops();
    render();
  });
  IDS.forEach(function (id) { els[id].addEventListener("input", render); });

  renderHops();
  // Latency has no upstream tab (unlike Queue, which piggybacks on Database's
  // onChange), so nothing in the render cascade would ever reach it -- it
  // has to kick off its own first render instead of waiting to be called.
  render();

  // The hop list is the only calculator state that isn't a DOM field, so
  // snapshots (save slots, presets) can't pick it up by scanning inputs
  // the way they do every other tab. These two are its way in and out.
  function getHops() {
    return hops.map(function (h) {
      return { id: h.id, name: h.name, ms: h.ms, count: h.count, on: h.on };
    });
  }
  function setHops(list) {
    if (!Array.isArray(list) || !list.length) return;
    hops = list.map(function (h, i) {
      return {
        id: typeof h.id === "number" ? h.id : 200 + i,
        name: typeof h.name === "string" ? h.name : "Hop",
        ms: String(h.ms == null ? "0" : h.ms),
        count: String(h.count == null ? "1" : h.count),
        on: h.on !== false
      };
    });
    nextId = hops.reduce(function (m, h) { return Math.max(m, h.id); }, 100) + 1;
    renderHops();
  }

  return { state: state, render: render, reset: reset, getHops: getHops, setHops: setHops };
}
