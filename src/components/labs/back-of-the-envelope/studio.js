// Turns the diagram into a capacity model on screen: one traffic dial at the
// top, a load badge on every node, and a properties panel for whichever node
// is selected. Everything here reads computeGraph and writes DOM. The diagram
// editor owns the nodes; this owns their numbers.

import { computeGraph, GLOBAL_DEFAULTS } from "./engine.js";
import { KINDS, KIND_KEYS, FIELDS, kindOf, propsOf, fieldsOf, scalingOf } from "./node-types.js";
import { fmt, int, short, bytes, dur } from "./format.js";
import { runTests } from "./engine.test.js";
import { renderRunChart, runToCsv } from "./chart.js";
import { setModel, setRun, clearRun, getState } from "./run-store.js";

var GLOBALS_KEY = "boe-studio-globals-v1";
var ON_KEY = "boe-studio-on-v1";

// Formula shown on hover beside every derived number, so nothing on screen is
// a figure the reader has to take on trust.
var WHY = {
  peakRps: "dau x requests per user x peak multiplier / 86400",
  headroom: "smallest capacity / load across the loaded nodes",
  p50: "sum along the slowest path of service + queueing + network per hop",
  p99: "same path, each node multiplied by tail factor x (1 + 2 x utilization squared)",
  availability: "product of every node on the slowest path, each combined across its own instances",
  downtime: "(1 - availability) x 525600 minutes",
  cost: "$/hr x instances x 730, plus storage and egress",
  costPer1k: "monthly cost / requests per month x 1000",
  egress: "responses/s x response bytes x 2592000, less what the CDN served",
  storage: "writes/s x record bytes x (1 + replicas) x 86400",
  util: "load / (capacity per instance x instances)",
  utilScaled: "load / what it could reach at full scale, so the bar reads how close the wall is",
  queueing: "M/M/c Erlang C wait at this utilization",
  backlog: "(arrivals - drain rate) x 60",
  connections: "caller instances x pool size, against max connections x instances",
  disk: "(disk capacity - held today) / growth per day"
};

// What a kind does to a request, said plainly. The panel shows this so the
// numbers underneath have a reason rather than just appearing.
// Clients are a special case: they have `pass: "all"` like a service, but they
// originate traffic rather than forwarding it, so the generic wording is wrong.
var CLIENT_BLURB = "Where traffic starts. The dial above sets the total for the whole diagram; the weight below decides how much of it comes in here.";

var PASS_BLURB = {
  all:   "Every request passes through to whatever this calls.",
  miss:  "Serves what it can. Only the misses continue downstream.",
  sink:  "Answers the request. The path ends here.",
  async: "Takes work off the request path. Consumers drain it later.",
  none:  "Not on the traffic path, so it carries no load."
};

// Load-test shapes, in the spirit of a k6 executor. Each is a multiplier on
// the traffic dial over normalized time, so the same profile works whatever
// the diagram is sitting at. A steady climb answers "when does it break", but
// a step test is the one you can actually read, and a spike asks a different
// question entirely: does it recover.
var SCENARIOS = [
  { key: "ramp",   label: "Ramp to 100x", secs: 20,
    hint: "Climbs smoothly. Shows the order things give way in." },
  { key: "stress", label: "Stress steps", secs: 25,
    hint: "Holds at 1x, 3x, 10x, 30x, 100x so each level can be read." },
  { key: "spike",  label: "Spike", secs: 18,
    hint: "Normal, a sudden 30x surge, then back. Tests recovery, not capacity." },
  { key: "soak",   label: "Soak", secs: 30,
    hint: "Settles at 5x and stays there. Backlogs and storage show up here." },
  { key: "break",  label: "Breakpoint", secs: 25,
    hint: "Climbs until the first node gives out, then stops and reports where." }
];

// t runs 0 to 1. Returns the multiplier on the starting traffic.
function profile(key, t) {
  if (key === "stress") {
    var steps = [1, 3, 10, 30, 100];
    return steps[Math.min(steps.length - 1, Math.floor(t * steps.length))];
  }
  if (key === "spike") {
    if (t < 0.22) return 1;
    if (t < 0.32) return Math.pow(30, (t - 0.22) / 0.1);
    if (t < 0.58) return 30;
    if (t < 0.68) return Math.pow(30, 1 - (t - 0.58) / 0.1);
    return 1;
  }
  if (key === "soak") return t < 0.12 ? Math.pow(5, t / 0.12) : 5;
  return Math.pow(100, t);   // ramp and breakpoint climb the same way
}

function scenarioBy(key) {
  for (var i = 0; i < SCENARIOS.length; i++) if (SCENARIOS[i].key === key) return SCENARIOS[i];
  return SCENARIOS[0];
}

function downloadText(filename, mime, text) {
  var blob = new Blob([text], { type: mime + ";charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function money(x) {
  if (!isFinite(x)) return "n/a";
  var a = Math.abs(x);
  if (a >= 1e6) return "$" + (x / 1e6).toFixed(2) + "M";
  if (a >= 1000) return "$" + Math.round(x).toLocaleString("en-US");
  if (a >= 1) return "$" + x.toFixed(2);
  if (a === 0) return "$0";
  return "$" + x.toFixed(4);
}

function pct(x) {
  if (!isFinite(x)) return "over";
  // A node carrying real traffic should never read 0%. Rounding a 0.3% load
  // down makes a working node look like one nothing reached.
  if (x > 0 && x < 0.005) return "<1%";
  return Math.round(x * 100) + "%";
}

function rps(x) {
  if (!isFinite(x)) return "n/a";
  if (x >= 1000) return short(x);
  if (x >= 10) return Math.round(x).toString();
  if (x > 0 && x < 1) return x.toFixed(2);
  return x.toFixed(1);
}

// What a node has grown to, or empty when it is sitting at the size it was
// drawn at. Kept short: this shares a 140px node with three other figures.
function scaleTag(r) {
  if (!r || r.scaling === "fixed") return "";
  if (r.scaling === "vertical") return r.sizeMult > 1.01 ? r.sizeMult.toFixed(1) + "x size" : "";
  return r.units > r.baseUnits ? r.units + " inst" : "";
}

function ms(x) {
  if (!isFinite(x)) return "n/a";
  if (x >= 1000) return (x / 1000).toFixed(2) + "s";
  if (x >= 10) return Math.round(x) + "ms";
  return x.toFixed(1) + "ms";
}

export function initStudio(bridge) {
  var host = document.getElementById("dgStudio");
  if (!host) return null;

  var globals = Object.assign({}, GLOBAL_DEFAULTS);
  try {
    var saved = JSON.parse(localStorage.getItem(GLOBALS_KEY) || "null");
    if (saved) globals = Object.assign(globals, saved);
  } catch (e) { /* defaults stand */ }

  var enabled = true;
  try { enabled = localStorage.getItem(ON_KEY) !== "off"; } catch (e) {}

  var lastResult = null;
  var ramp = null;
  var runBase = null;
  var scenarioKey = globals.scenario || "ramp";
  var runNote = null;
  var samples = [];
  var timeline = [];

  var dauInput = document.getElementById("dgDau");
  var dauOut = document.getElementById("dgDauOut");
  var peakInput = document.getElementById("dgPeak");
  var peakOut = document.getElementById("dgPeakOut");
  var verdictEl = document.getElementById("dgVerdict");
  var statsEl = document.getElementById("dgStats");
  var warnEl = document.getElementById("dgStudioWarn");
  var propsEl = document.getElementById("dgProps");
  var propsBody = document.getElementById("dgPropsBody");
  var propsTitle = document.getElementById("dgPropsTitle");
  var toggleBtn = document.getElementById("dgStudioToggle");
  var rampBtn = document.getElementById("dgRamp");
  var timelineEl = document.getElementById("dgTimeline");
  var globalsBtn = document.getElementById("dgGlobals");
  var globalsPanel = document.getElementById("dgGlobalsPanel");
  var testsEl = document.getElementById("dgTests");
  var legendEl = document.getElementById("dgLegend");
  var chartEl = document.getElementById("dgChart");
  var chartSvg = document.getElementById("dgChartSvg");
  var chartTitle = document.getElementById("dgChartTitle");
  var scenarioEl = document.getElementById("dgScenario");
  var autoscaleEl = document.getElementById("dgAutoscale");
  var rampLabel = document.getElementById("dgRampLabel");

  // The dial is logarithmic: 1k to 1B in one sweep, so the interesting decade
  // is not squeezed into the last few pixels.
  function dauFromSlider(v) { return Math.round(Math.pow(10, parseFloat(v))); }
  function sliderFromDau(d) { return Math.log10(Math.max(1000, d)); }

  function persist() {
    globals.scenario = scenarioKey;
    try { localStorage.setItem(GLOBALS_KEY, JSON.stringify(globals)); } catch (e) {}
  }

  function recompute() {
    if (!enabled) return;
    lastResult = computeGraph({ globals: globals, nodes: bridge.getNodes(), edges: bridge.getEdges() });
    setModel(lastResult, globals);
    paintDials();
    paintVerdict();
    paintStats();
    paintWarnings();
    paintBadges();
    paintFlow();
    paintProps();
    return lastResult;
  }

  function paintDials() {
    if (dauOut) dauOut.textContent = short(globals.dau);
    if (peakOut) peakOut.textContent = globals.peakMultiplier + "x";
    if (dauInput && document.activeElement !== dauInput) dauInput.value = sliderFromDau(globals.dau);
    if (peakInput && document.activeElement !== peakInput) peakInput.value = globals.peakMultiplier;
  }

  // The one line that answers "where does this break".
  function paintVerdict() {
    if (!verdictEl) return;
    verdictEl.innerHTML = "";
    var s = lastResult.system;
    var b = s.bottleneck;
    if (!b) {
      verdictEl.dataset.status = "none";
      verdictEl.appendChild(el("span", "dg-verdict-text", bridge.getNodes().length
        ? "Nothing is carrying traffic yet. Connect a client node to the rest of the diagram."
        : "Draw a system, starting with a client."));
      return;
    }
    verdictEl.dataset.status = b.status;
    var name = el("b", "dg-verdict-name", b.label);
    var tail;
    if (b.status === "saturated") {
      tail = " is over capacity at " + pct(b.utilization) + ", limited by " + b.binding + ".";
    } else if (b.status === "red") {
      tail = " is the bottleneck at " + pct(b.utilization) + " and has little left, limited by " + b.binding + ".";
    } else {
      tail = " is the busiest node at " + pct(b.utilization) + ", limited by " + b.binding + ".";
    }
    var line = el("span", "dg-verdict-text");
    line.appendChild(name);
    line.appendChild(document.createTextNode(tail));
    if (isFinite(s.headroom)) {
      line.appendChild(document.createTextNode(
        s.headroom >= 1
          ? " Room for " + (s.headroom >= 10 ? Math.round(s.headroom) : s.headroom.toFixed(1)) + "x today's traffic."
          : " Already past what it can serve."
      ));
    }
    verdictEl.appendChild(line);
    var jump = el("button", "dg-verdict-jump", "Show me");
    jump.type = "button";
    jump.addEventListener("click", function () { bridge.focusNode(b.id); });
    verdictEl.appendChild(jump);
  }

  function stat(label, value, why, tone) {
    var box = el("div", "dg-stat" + (tone ? " tone-" + tone : ""));
    box.title = why || "";
    box.appendChild(el("div", "dg-stat-val", value));
    var l = el("div", "dg-stat-label", label);
    if (why) l.appendChild(el("span", "dg-stat-why", "?"));
    box.appendChild(l);
    return box;
  }

  function paintStats() {
    if (!statsEl) return;
    var s = lastResult.system;
    statsEl.innerHTML = "";
    statsEl.appendChild(stat("peak rps", rps(s.peakRps), WHY.peakRps));
    statsEl.appendChild(stat("headroom",
      isFinite(s.headroom) ? (s.headroom >= 10 ? Math.round(s.headroom) + "x" : s.headroom.toFixed(1) + "x") : "n/a",
      WHY.headroom, s.headroom < 1 ? "bad" : s.headroom < 2 ? "warn" : "ok"));
    statsEl.appendChild(stat("p50", ms(s.p50), WHY.p50));
    statsEl.appendChild(stat("p99", ms(s.p99), WHY.p99, s.p99 > 1000 ? "bad" : ""));
    statsEl.appendChild(stat("availability", (s.availability * 100).toFixed(3) + "%", WHY.availability,
      s.availability < 0.99 ? "bad" : ""));
    statsEl.appendChild(stat("downtime / yr", dur(s.downtimeMinutesPerYear * 60), WHY.downtime));
    statsEl.appendChild(stat("cost / mo", money(s.totalCost), WHY.cost));
    statsEl.appendChild(stat("per 1k req", money(s.costPer1kRequests), WHY.costPer1k));
    statsEl.appendChild(stat("egress / mo", bytes(s.egressMonthBytes), WHY.egress));
    statsEl.appendChild(stat("storage / yr", bytes(s.storagePerYearBytes), WHY.storage));
    if (isFinite(s.daysToFull)) {
      statsEl.appendChild(stat("disk full in",
        s.daysToFull > 999 ? "> 3 yr" : Math.round(s.daysToFull) + " d",
        WHY.disk + (s.fillsFirst ? " (" + s.fillsFirst.label + ")" : ""),
        s.daysToFull < 90 ? "bad" : s.daysToFull < 365 ? "warn" : "ok"));
    }

    if (legendEl && !legendEl.childElementCount) {
      [["green", "under 60%"], ["amber", "60 to 85%"], ["red", "85 to 100%"], ["saturated", "over capacity"]]
        .forEach(function (pair) {
          var item = el("span", "dg-legend-item");
          item.dataset.status = pair[0];
          item.appendChild(el("i", "dg-legend-swatch"));
          item.appendChild(el("span", "", pair[1]));
          legendEl.appendChild(item);
        });
    }
  }

  function paintWarnings() {
    if (!warnEl) return;
    var ws = lastResult.warnings;
    warnEl.innerHTML = "";
    warnEl.hidden = !ws.length;
    ws.slice(0, 4).forEach(function (w) {
      var row = el("div", "dg-studio-warn-row dg-warn-" + w.level);
      row.appendChild(el("span", "dg-warn-dot", w.level === "warn" ? "!" : "i"));
      row.appendChild(el("span", "", w.text));
      if (w.nodeId) {
        var go = el("button", "dg-warn-jump", "show");
        go.type = "button";
        go.addEventListener("click", function () { bridge.focusNode(w.nodeId); });
        row.appendChild(go);
      }
      warnEl.appendChild(row);
    });
  }

  // Badges are written into the node elements the editor already rendered, so
  // a recompute never tears down an element mid-drag.
  function paintBadges() {
    var grew = false;
    var critical = {};
    if (lastResult.critical) lastResult.critical.nodes.forEach(function (id) { critical[id] = true; });

    bridge.nodeLayer.querySelectorAll(".dg-node").forEach(function (nodeEl) {
      var r = lastResult.nodes[nodeEl.dataset.id];
      var box = nodeEl.querySelector(".dg-load");
      // Entry points get a plain readout of what they emit. A utilization bar
      // would be meaningless on something with no capacity of its own.
      if (r && r.source) {
        if (box) box.remove();
        var out = nodeEl.querySelector(".dg-emits");
        if (!out) {
          out = el("div", "dg-emits");
          nodeEl.appendChild(out);
          if (bridge.fitNode && bridge.fitNode(nodeEl.dataset.id)) grew = true;
        }
        out.textContent = rps(r.emitsRps) + " rps out"
          + (r.shareOfTraffic < 0.999 ? "  " + Math.round(r.shareOfTraffic * 100) + "%" : "");
        out.title = r.label + " emits " + Math.round(r.emitsRps) + " rps, "
          + Math.round(r.shareOfTraffic * 100) + "% of the total set on the dial.";
        delete nodeEl.dataset.status;
        return;
      }
      var stale = nodeEl.querySelector(".dg-emits");
      if (stale) stale.remove();
      if (!r || !r.serves || !r.onPath) {
        if (box) box.remove();
        delete nodeEl.dataset.status;
        nodeEl.classList.remove("dg-critical");
        return;
      }
      nodeEl.dataset.status = r.status;
      nodeEl.classList.toggle("dg-critical", !!critical[r.id]);
      if (!box) {
        box = el("div", "dg-load");
        box.appendChild(el("div", "dg-load-bar")).appendChild(el("i"));
        box.appendChild(el("div", "dg-load-txt"));
        nodeEl.appendChild(box);
        // The badge and its taller padding arrive after createNodeEl already
        // sized the node, so without this the label sits underneath it.
        if (bridge.fitNode && bridge.fitNode(nodeEl.dataset.id)) grew = true;
      }
      var fill = box.querySelector("i");
      var u = isFinite(r.utilization) ? r.utilization : 1;
      fill.style.width = Math.min(100, u * 100) + "%";
      // Utilization first: it is the number that decides whether this node is
      // the problem. The glyph carries the worst states without relying on
      // colour, which the bar above already uses.
      var glyph = r.status === "saturated" ? "! " : "";
      var tag = scaleTag(r);
      box.querySelector(".dg-load-txt").textContent =
        glyph + pct(r.utilization) + " · " + rps(r.loadRps) + " rps · "
        + (tag || ms(r.totalMs));
      nodeEl.classList.toggle("dg-at-ceiling", !!r.atCeiling);
      box.title = r.label + ": " + (r.scaling === "fixed" ? WHY.util : WHY.utilScaled)
        + ". Queueing " + ms(r.queueingMs) + " on top of " + ms(r.serviceMs)
        + " service. Limited by " + r.binding + "."
        + (r.atCeiling ? " It has nothing left to add." : "");
    });
    if (grew && bridge.renderEdges) bridge.renderEdges();
  }

  // Animated flow already exists on edges the user styled. Tie its speed to
  // the traffic actually crossing that edge, on a log scale so 100 rps and
  // 100k rps are both legible rather than one being a blur.
  var FLOW_SEL = ".dg-edge-flow-dot, .dg-edge-flow-packet, .dg-flow-dash";
  function paintFlow() {
    bridge.edgeLayer.querySelectorAll(".dg-edge").forEach(function (g) {
      var r = lastResult.edgeRps[g.dataset.id];
      g.querySelectorAll(FLOW_SEL).forEach(function (fx) {
        if (!(r > 0)) { fx.style.animationDuration = ""; return; }
        // 1 rps crawls at 3s a lap, 100k rps runs at 0.35s.
        var t = Math.min(1, Math.log10(r + 1) / 5);
        fx.style.animationDuration = (3 - t * 2.65).toFixed(2) + "s";
      });
    });
  }

  // Properties for the selected node. Empty input means "use the default for
  // this kind", which is what keeps an imported diagram computable untouched.
  //
  // Typing in a field recomputes, and recomputing repaints this panel, so the
  // fields are rebuilt only when the node or its kind actually changes. Any
  // other repaint just refreshes the readout underneath, or the input being
  // typed into would lose focus after every keystroke.
  var propsFor = null;
  var panelClosed = false;
  var lastSelId = null;

  function paintProps() {
    if (!propsEl) return;
    var ids = bridge.getSelection();
    var node = ids.length === 1 ? bridge.getNode(ids[0]) : null;
    if (node && (node.type === "container" || node.shape === "text")) node = null;

    // Closing is a "get out of my way now", not a permanent setting, so
    // picking a different node brings it back.
    var selId = node ? node.id : null;
    if (selId && selId !== lastSelId) panelClosed = false;
    lastSelId = selId;

    if (panelClosed) { propsEl.hidden = true; propsFor = null; return; }
    propsEl.hidden = false;

    // Deselecting used to hide the whole panel, which made it look like a bug.
    // It stays and says what to do instead.
    if (!node) {
      if (propsFor === "@empty") return;
      propsFor = "@empty";
      propsTitle.textContent = "Nothing selected";
      propsBody.innerHTML = "";
      var empty = el("div", "dg-props-empty");
      empty.appendChild(el("p", "", "Click a node to set what it can handle."));
      empty.appendChild(el("p", "", "Every node already has defaults for its kind, so the diagram computes before you change anything. A blank field means the default is in use."));
      propsBody.appendChild(empty);
      return;
    }

    var kind = kindOf(node);
    var r = lastResult ? lastResult.nodes[node.id] : null;
    propsTitle.textContent = node.label || "Node";

    if (propsFor === node.id + "/" + kind) { paintEffect(node, r); return; }
    propsFor = node.id + "/" + kind;
    propsBody.innerHTML = "";

    var blurb = el("p", "dg-props-blurb", kind === "client" ? CLIENT_BLURB : (PASS_BLURB[KINDS[kind].pass] || ""));
    propsBody.appendChild(blurb);

    var kindRow = el("label", "dg-prop dg-prop-kind");
    kindRow.appendChild(el("span", "dg-prop-label", "Behaves like"));
    var sel = el("select", "dg-prop-input");
    KIND_KEYS.forEach(function (k) {
      var o = el("option", "", KINDS[k].label);
      o.value = k;
      if (k === kind) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      bridge.pushUndo();
      node.kind = sel.value;
      node.props = {};
      propsFor = null;          // different kind, different fields
      bridge.save();
      recompute();
    });
    kindRow.appendChild(sel);
    propsBody.appendChild(kindRow);

    var defaults = KINDS[kind].defaults;
    var current = propsOf(node);
    fieldsOf(node).forEach(function (key) {
      var spec = FIELDS[key];
      if (!spec) return;
      // A dropdown gets its own line: "active-active" does not fit an 82px
      // column, and clipping the value is worse than one more row.
      var isScale = key === "scaling" || key === "maxScale" || key === "targetUtil";
      var row = el("label", "dg-prop" + (spec.options ? " dg-prop-wide" : "")
                   + (isScale && !globals.autoscale ? " dg-prop-off" : ""));
      var lab = el("span", "dg-prop-label", spec.label + (spec.unit ? " (" + spec.unit + ")" : ""));
      lab.title = spec.hint;
      row.appendChild(lab);
      var input;
      if (spec.options) {
        input = el("select", "dg-prop-input");
        // The scaling mode lives on the kind rather than in its defaults, so
        // the effective value has to be resolved rather than read off props,
        // or the control shows "fixed" for a node the engine is scaling.
        var shown = key === "scaling" ? scalingOf(node, globals.autoscale) : current[key];
        spec.options.forEach(function (o) {
          var opt = el("option", "", o);
          opt.value = o;
          if (o === shown) opt.selected = true;
          input.appendChild(opt);
        });
      } else {
        input = el("input", "dg-prop-input");
        input.type = "number";
        input.min = spec.min;
        input.max = spec.max;
        input.step = spec.step;
        input.placeholder = String(defaults[key]);
        var own = node.props && node.props[key];
        input.value = own === undefined || own === null || own === "" ? "" : own;
      }
      input.addEventListener("input", function () {
        if (!node.props) node.props = {};
        var v = input.value;
        if (v === "") delete node.props[key];
        else node.props[key] = spec.options ? v : parseFloat(v);
        bridge.save();
        recompute();
      });
      input.addEventListener("change", function () { bridge.pushUndo(); });
      row.appendChild(input);
      propsBody.appendChild(row);
    });

    if (KINDS[kind].scales && !globals.autoscale) {
      propsBody.appendChild(el("p", "dg-prop-note",
        "Autoscaling is off, so this node stays the size above. Turn it on beside the Run button."));
    }

    propsBody.appendChild(el("div", "dg-prop-effect"));
    paintEffect(node, r);
  }

  // What the current numbers do, restated under the fields so an edit shows
  // its consequence without the reader hunting for it on the canvas.
  function paintEffect(node, r) {
    var effect = propsBody.querySelector(".dg-prop-effect");
    if (!effect) return;
    effect.innerHTML = "";
    if (r && r.source) {
      var pctIn = Math.round(r.shareOfTraffic * 100);
      var lead = el("div", "dg-prop-effect-row dg-prop-effect-lead",
        r.emitsRps > 0 ? "Emits " + rps(r.emitsRps) + " rps, " + pctIn + "% of all traffic"
                       : "Emits nothing. Its weight is 0.");
      effect.appendChild(lead);
      // The question this control kept raising was what a given number means,
      // so answer it here rather than in a tooltip.
      effect.appendChild(el("div", "dg-prop-effect-row",
        r.sourceCount === 1
          ? "The only entry point, so any weight above 0 gives it all of the traffic. Weights start to matter once a second one exists."
          : "One of " + r.sourceCount + " entry points. The weights are compared against each other, not read as percentages."));
      return;
    }
    if (!r || !r.serves) {
      effect.appendChild(el("div", "dg-prop-effect-row", "Off the traffic path, so it carries no load."));
      return;
    }
    var scaled = r.scaling !== "fixed";
    effect.appendChild(el("div", "dg-prop-effect-row",
      rps(r.loadRps) + " rps in, " + pct(r.utilization) + " of "
      + rps(r.capacityTotal) + " rps" + (scaled ? " at full scale" : " capacity")));
    if (scaled) {
      effect.appendChild(el("div", "dg-prop-effect-row" + (r.atCeiling ? " tone-bad" : ""),
        r.scaling === "vertical"
          ? "Running at " + r.sizeMult.toFixed(1) + "x size" + (r.atCeiling ? ", as big as it goes" : "")
          : "Running " + int(r.units) + " of up to " + int(r.maxUnits) + " instances"
              + (r.atCeiling ? ", nothing left to add" : "")));
    }
    effect.appendChild(el("div", "dg-prop-effect-row",
      ms(r.serviceMs) + " service + " + ms(r.queueingMs) + " waiting = " + ms(r.totalMs)));
    effect.appendChild(el("div", "dg-prop-effect-row",
      (r.availability * 100).toFixed(3) + "% available, " + money(r.monthlyCost) + " a month"));
    if (r.backlogPerMin > 0) {
      effect.appendChild(el("div", "dg-prop-effect-row tone-bad",
        "Backlog growing by " + int(r.backlogPerMin) + " messages a minute"));
    }
    if (r.connCap > 0) {
      effect.appendChild(el("div", "dg-prop-effect-row" + (r.connUtil > 1 ? " tone-bad" : ""),
        int(r.connDemand) + " of " + int(r.connCap) + " connections held"
        + (r.connUtil > 1 ? ", over the limit" : "")));
    }
    if (isFinite(r.daysToFull)) {
      effect.appendChild(el("div", "dg-prop-effect-row" + (r.daysToFull < 90 ? " tone-bad" : ""),
        "Disk full in " + (r.daysToFull > 999 ? "over 3 years" : Math.round(r.daysToFull) + " days")
        + " at " + bytes(r.growthBytesPerDay) + " a day"));
    }
  }

  // Runs the chosen shape against the dial and logs what gives way. The
  // starting traffic is put back afterwards, so a run is something you watch
  // rather than something that edits your diagram behind you.
  function startRun() {
    if (ramp) return stopRun();
    var scenario = scenarioBy(scenarioKey);
    runBase = globals.dau;
    var t0 = performance.now();
    var duration = scenario.secs * 1000;
    var seen = {};
    timeline = [];
    samples = [];
    runNote = null;
    clearRun();
    setRunning(true);
    timelineEl.hidden = false;
    if (chartEl) chartEl.hidden = true;

    var tick = function () {
      var t = (performance.now() - t0) / duration;
      var done = t >= 1;
      globals.dau = Math.max(1000, Math.round(runBase * profile(scenario.key, Math.min(t, 1))));
      recompute();
      sample(performance.now() - t0);
      logStatuses(seen);

      // Breakpoint is the one shape with a stopping condition of its own.
      if (scenario.key === "break") {
        var b = lastResult.system.bottleneck;
        if (b && b.status === "saturated") {
          runNote = b.label + " gave out at " + short(globals.dau) + " daily users, "
                  + (runBase > 0 ? (globals.dau / runBase).toFixed(1) + "x where you started." : "");
          return finishRun(scenario);
        }
      }
      if (done) {
        if (scenario.key === "break") runNote = "Nothing gave out, even at 100x.";
        return finishRun(scenario);
      }
      ramp = requestAnimationFrame(tick);
    };
    ramp = requestAnimationFrame(tick);
  }

  // One row per frame. Per-node utilization rides along so the CSV can carry
  // more than the two series the chart has room to draw.
  function sample(ms) {
    var sys = lastResult.system;
    var counts = { green: 0, amber: 0, red: 0, saturated: 0 };
    var util = {};
    Object.keys(lastResult.nodes).forEach(function (id) {
      var r = lastResult.nodes[id];
      if (!r.serves || !r.onPath) return;
      if (counts[r.status] !== undefined) counts[r.status]++;
      util[id] = r.utilization;
    });
    samples.push({
      ms: ms, dau: globals.dau, rps: sys.peakRps,
      p50: sys.p50, p99: sys.p99, cost: sys.totalCost,
      availability: sys.availability, counts: counts, util: util,
      bottleneck: sys.bottleneck ? sys.bottleneck.label : ""
    });
  }

  function finishRun(scenario) {
    paintTimeline();
    // Stamp each logged event with when it happened, so the chart can mark it.
    var stamped = timeline.map(function (t) {
      var hit = null;
      for (var i = 0; i < samples.length; i++) {
        if (samples[i].dau >= t.dau) { hit = samples[i].ms; break; }
      }
      return { label: t.label, status: t.status, dau: t.dau, detail: t.detail || "", ms: hit };
    });
    setRun({ key: scenario.key, label: scenario.label, seconds: scenario.secs }, samples, stamped, runNote);
    paintChart(scenario);
    stopRun();
  }

  function paintChart(scenario) {
    if (!chartEl || !chartSvg) return;
    if (samples.length < 2) { chartEl.hidden = true; return; }
    chartEl.hidden = false;
    if (chartTitle) {
      var last = samples[samples.length - 1];
      var peak = samples.reduce(function (a, b) { return b.rps > a.rps ? b : a; }, samples[0]);
      chartTitle.textContent = scenario.label + ", peak " + rps(peak.rps) + " rps, worst p99 "
        + ms(samples.reduce(function (a, b) { return Math.max(a, b.p99); }, 0));
    }
    renderRunChart(chartSvg, samples, getState().events);
  }

  function setRunning(on) {
    if (!rampBtn) return;
    if (on) rampBtn.dataset.running = "1";
    else delete rampBtn.dataset.running;
    if (rampLabel) rampLabel.textContent = on ? "Stop" : "Run";
    var play = rampBtn.querySelector(".dg-run-play");
    var stop = rampBtn.querySelector(".dg-run-stop");
    if (play) play.hidden = on;
    if (stop) stop.hidden = !on;
  }

  var RANK = { green: 0, amber: 1, red: 2, saturated: 3 };
  function logStatuses(seen) {
    var changed = false;
    Object.keys(lastResult.nodes).forEach(function (id) {
      var r = lastResult.nodes[id];
      if (!r.serves || !r.onPath) return;

      // Reaching the scale ceiling is the moment worth catching for anything
      // that grows: the point where more traffic stops being absorbed.
      if (r.atCeiling && !seen["max:" + id]) {
        seen["max:" + id] = true;
        timeline.push({
          label: r.label, status: "ceiling", dau: globals.dau,
          detail: r.scaling === "vertical"
            ? "as big as it goes"
            : "maxed at " + int(r.units) + " instances"
        });
        changed = true;
      }

      var rank = RANK[r.status];
      if (rank === undefined || rank === 0) return;
      if (seen[id] !== undefined && seen[id] >= rank) return;
      seen[id] = rank;
      timeline.push({ label: r.label, status: r.status, dau: globals.dau });
      changed = true;
    });
    if (changed) paintTimeline();
  }

  var STATUS_WORD = {
    amber: "filling up", red: "nearly full",
    saturated: "over capacity", ceiling: "at its limit"
  };

  function paintTimeline() {
    if (!timelineEl) return;
    timelineEl.innerHTML = "";

    var head = el("div", "dg-timeline-head");
    head.appendChild(el("span", "", "What breaks, in order"));
    var x = el("button", "dg-timeline-x", "\u00d7");
    x.type = "button";
    x.setAttribute("aria-label", "Hide this log");
    x.title = "Hide";
    x.addEventListener("click", function () { timelineEl.hidden = true; });
    head.appendChild(x);
    timelineEl.appendChild(head);

    if (runNote) timelineEl.appendChild(el("div", "dg-timeline-note", runNote));
    if (!timeline.length) {
      timelineEl.appendChild(el("div", "dg-timeline-empty", "Everything held. Nothing passed 60%."));
      return;
    }
    timeline.slice(-14).forEach(function (t) {
      var row = el("div", "dg-timeline-row");
      row.dataset.status = t.status;
      row.appendChild(el("span", "dg-timeline-dau", short(t.dau) + " DAU"));
      row.appendChild(el("span", "dg-timeline-label", t.label));
      row.appendChild(el("span", "dg-timeline-status", t.detail || STATUS_WORD[t.status] || t.status));
      timelineEl.appendChild(row);
    });
  }

  function stopRun() {
    if (ramp) cancelAnimationFrame(ramp);
    ramp = null;
    setRunning(false);
    if (runBase !== null) { globals.dau = runBase; runBase = null; recompute(); }
  }

  // Globals that are not the two dials: request sizes, retention, network
  // hops, tail factor. Rarely touched, so they live behind a disclosure.
  var GLOBAL_FIELDS = [
    { key: "requestsPerUser", label: "Requests per user per day", step: 1 },
    { key: "readWriteRatio", label: "Reads per write", step: 1 },
    { key: "avgRequestBytes", label: "Request size (bytes)", step: 1 },
    { key: "avgResponseBytes", label: "Response size (bytes)", step: 1 },
    { key: "retentionDays", label: "Retention (days)", step: 1 },
    { key: "clientRttMs", label: "Client round trip (ms)", step: 1 },
    { key: "netSameAzMs", label: "Network per hop (ms)", step: 0.1 },
    { key: "azAvailability", label: "Per-AZ availability (%)", step: 0.001 },
    { key: "tailFactor", label: "Tail factor for p99", step: 0.1 }
  ];

  function buildGlobals() {
    if (!globalsPanel) return;
    globalsPanel.innerHTML = "";
    GLOBAL_FIELDS.forEach(function (f) {
      var row = el("label", "dg-prop");
      row.appendChild(el("span", "dg-prop-label", f.label));
      var input = el("input", "dg-prop-input");
      input.type = "number";
      input.step = f.step;
      input.value = globals[f.key];
      input.addEventListener("input", function () {
        var v = parseFloat(input.value);
        if (isFinite(v)) { globals[f.key] = v; persist(); recompute(); }
      });
      row.appendChild(input);
      globalsPanel.appendChild(row);
    });
    var note = el("p", "dg-globals-note",
      "Every capacity, price and latency default is an order-of-magnitude estimate, not a quote.");
    globalsPanel.appendChild(note);
  }

  function buildTests() {
    if (!testsEl) return;
    var results = runTests();
    var failed = results.filter(function (r) { return !r.pass; });
    testsEl.innerHTML = "";
    var head = el("div", "dg-tests-head",
      failed.length ? failed.length + " of " + results.length + " engine checks failing"
                    : "All " + results.length + " engine checks pass");
    head.dataset.status = failed.length ? "bad" : "ok";
    testsEl.appendChild(head);
    results.forEach(function (r) {
      var row = el("div", "dg-test-row");
      row.dataset.pass = r.pass ? "1" : "0";
      row.appendChild(el("span", "dg-test-mark", r.pass ? "ok" : "x"));
      row.appendChild(el("span", "dg-test-name", r.name));
      if (r.note) row.appendChild(el("span", "dg-test-note", r.note));
      testsEl.appendChild(row);
    });
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem(ON_KEY, on ? "on" : "off"); } catch (e) {}
    host.hidden = !on;
    if (toggleBtn) toggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    bridge.root.classList.toggle("dg-studio-on", on);
    if (on) recompute();
    else {
      stopRun();
      bridge.nodeLayer.querySelectorAll(".dg-load").forEach(function (b) { b.remove(); });
      bridge.edgeLayer.querySelectorAll(FLOW_SEL).forEach(function (fx) { fx.style.animationDuration = ""; });
      bridge.nodeLayer.querySelectorAll(".dg-node").forEach(function (n) {
        delete n.dataset.status;
        n.classList.remove("dg-critical");
      });
      if (propsEl) propsEl.hidden = true;
    }
  }

  if (dauInput) {
    dauInput.addEventListener("input", function () {
      globals.dau = dauFromSlider(dauInput.value);
      persist();
      recompute();
    });
  }
  if (peakInput) {
    peakInput.addEventListener("input", function () {
      globals.peakMultiplier = parseFloat(peakInput.value);
      persist();
      recompute();
    });
  }
  var chartCsvBtn = document.getElementById("dgChartCsv");
  if (chartCsvBtn) {
    chartCsvBtn.addEventListener("click", function () {
      var st = getState();
      if (!st.samples.length) return;
      var labels = {};
      var ids = Object.keys(lastResult.nodes).filter(function (id) {
        var r = lastResult.nodes[id];
        labels[id] = r.label;
        return r.serves && r.onPath;
      });
      var name = "load-test-" + (st.scenario ? st.scenario.key : "run") + ".csv";
      downloadText(name, "text/csv", runToCsv(st.samples, ids, labels));
    });
  }
  var chartCloseBtn = document.getElementById("dgChartClose");
  if (chartCloseBtn) chartCloseBtn.addEventListener("click", function () { chartEl.hidden = true; });

  var propsCloseBtn = document.getElementById("dgPropsClose");
  if (propsCloseBtn) {
    propsCloseBtn.addEventListener("click", function () {
      panelClosed = true;
      propsEl.hidden = true;
      propsFor = null;
    });
  }
  if (scenarioEl) {
    SCENARIOS.forEach(function (sc) {
      var o = el("option", "", sc.label);
      o.value = sc.key;
      o.title = sc.hint;
      scenarioEl.appendChild(o);
    });
    scenarioEl.value = scenarioKey;
    scenarioEl.title = scenarioBy(scenarioKey).hint;
    scenarioEl.addEventListener("change", function () {
      scenarioKey = scenarioEl.value;
      scenarioEl.title = scenarioBy(scenarioKey).hint;
      persist();
    });
  }
  if (autoscaleEl) {
    autoscaleEl.checked = !!globals.autoscale;
    autoscaleEl.addEventListener("change", function () {
      globals.autoscale = autoscaleEl.checked;
      persist();
      propsFor = null;      // the panel gains and loses the scaling rows
      recompute();
    });
  }
  if (rampBtn) rampBtn.addEventListener("click", startRun);
  if (toggleBtn) toggleBtn.addEventListener("click", function () { setEnabled(!enabled); });
  if (globalsBtn) {
    globalsBtn.addEventListener("click", function () {
      var open = globalsPanel.hidden;
      globalsPanel.hidden = !open;
      globalsBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && !globalsPanel.childElementCount) buildGlobals();
    });
  }
  var testsBtn = document.getElementById("dgTestsToggle");
  if (testsBtn) {
    testsBtn.addEventListener("click", function () {
      var open = testsEl.hidden;
      testsEl.hidden = !open;
      testsBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) buildTests();
    });
  }
  // A hidden tab keeps animating otherwise, and the ramp would race ahead.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && ramp) stopRun();
  });

  setEnabled(enabled);
  return { recompute: recompute, isEnabled: function () { return enabled; }, result: function () { return lastResult; } };
}
