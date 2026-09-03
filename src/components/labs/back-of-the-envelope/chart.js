// Draws a finished load test: traffic and tail latency against time, with a
// health ribbon underneath showing how many nodes were in trouble at each
// moment. Hand-rolled SVG rather than a charting library, so it inherits the
// theme tokens and adds nothing to the bundle.
//
// Both series are log-scaled. A ramp covers two orders of magnitude, and on a
// linear axis the first 90% of the run would be a flat line on the floor.

var NS = "http://www.w3.org/2000/svg";
var W = 1000, H = 200;
var PAD = { l: 46, r: 58, t: 28, b: 30 };
var RIBBON = 14, GAP = 8;
var PLOT_H = H - PAD.t - PAD.b - RIBBON - GAP;

function tag(name, attrs, parent) {
  var e = document.createElementNS(NS, name);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  if (parent) parent.appendChild(e);
  return e;
}

function logScale(min, max, y0, y1) {
  var lo = Math.log10(Math.max(min, 1e-6));
  var hi = Math.log10(Math.max(max, min * 10, 1e-5));
  if (hi - lo < 0.3) hi = lo + 0.3;
  return function (v) {
    var t = (Math.log10(Math.max(v, 1e-6)) - lo) / (hi - lo);
    return y1 + (y0 - y1) * Math.min(Math.max(t, 0), 1);
  };
}

// Ticks on the decades, which is what a log axis is for.
function decades(min, max) {
  var out = [];
  var lo = Math.floor(Math.log10(Math.max(min, 1e-6)));
  var hi = Math.ceil(Math.log10(Math.max(max, 1e-5)));
  for (var e = lo; e <= hi && out.length < 7; e++) out.push(Math.pow(10, e));
  return out;
}

function fmtShort(v) {
  if (v >= 1e9) return (v / 1e9) + "B";
  if (v >= 1e6) return (v / 1e6) + "M";
  if (v >= 1e3) return (v / 1e3) + "K";
  if (v >= 1) return String(Math.round(v));
  return String(v);
}

function pathFrom(pts) {
  return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
}

export function renderRunChart(svg, samples, events) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 " + W + " " + H);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (!samples || samples.length < 2) return;

  var x0 = PAD.l, x1 = W - PAD.r;
  var y0 = PAD.t, y1 = PAD.t + PLOT_H;
  var span = samples[samples.length - 1].ms || 1;
  var xAt = function (ms) { return x0 + (x1 - x0) * (ms / span); };

  var maxRps = 0, maxMs = 0;
  samples.forEach(function (s) {
    if (s.rps > maxRps) maxRps = s.rps;
    if (s.p99 > maxMs) maxMs = s.p99;
  });
  var rpsY = logScale(Math.max(1, samples[0].rps / 2), maxRps * 1.4, y0, y1);
  var msY = logScale(Math.max(1, samples[0].p99 / 2), maxMs * 1.4, y0, y1);

  // Grid on the traffic decades, labelled both sides.
  decades(Math.max(1, samples[0].rps / 2), maxRps * 1.4).forEach(function (v) {
    var y = rpsY(v);
    if (y < y0 - 1 || y > y1 + 1) return;
    tag("line", { x1: x0, x2: x1, y1: y, y2: y, class: "dg-chart-grid" }, svg);
    tag("text", { x: x0 - 6, y: y + 3, class: "dg-chart-tick dg-chart-tick-l" }, svg).textContent = fmtShort(v);
  });
  decades(Math.max(1, samples[0].p99 / 2), maxMs * 1.4).forEach(function (v) {
    var y = msY(v);
    if (y < y0 - 1 || y > y1 + 1) return;
    tag("text", { x: x1 + 6, y: y + 3, class: "dg-chart-tick dg-chart-tick-r" }, svg).textContent = fmtShort(v);
  });

  // Traffic as a filled area, since it is the thing being done to the system.
  var rpsPts = samples.map(function (s) { return [xAt(s.ms), rpsY(s.rps)]; });
  tag("path", {
    d: pathFrom(rpsPts) + " L" + x1.toFixed(1) + " " + y1 + " L" + x0.toFixed(1) + " " + y1 + " Z",
    class: "dg-chart-area"
  }, svg);
  tag("path", { d: pathFrom(rpsPts), class: "dg-chart-line dg-chart-rps" }, svg);

  // Tail latency as a line, since it is the thing the system does back.
  tag("path", {
    d: pathFrom(samples.map(function (s) { return [xAt(s.ms), msY(s.p99)]; })),
    class: "dg-chart-line dg-chart-p99"
  }, svg);

  // Health ribbon: what share of the loaded nodes were in each state.
  var ry = y1 + GAP;
  var order = ["green", "amber", "red", "saturated"];
  // A 25s run at 60fps is 1500 samples, and one rect per status per sample is
  // several thousand nodes for a strip 14px tall. Draw at most 240 slices.
  var stepN = Math.max(1, Math.ceil(samples.length / 240));
  var shown = samples.filter(function (_, i) { return i % stepN === 0; });
  shown.forEach(function (s, i) {
    var total = order.reduce(function (a, k) { return a + (s.counts[k] || 0); }, 0);
    if (!total) return;
    var sx = xAt(s.ms);
    // Frames are not evenly spaced, so a fixed width would leave gaps. Each
    // slice runs to wherever the next one starts.
    var nx = i + 1 < shown.length ? xAt(shown[i + 1].ms) : x1;
    var w = Math.max(nx - sx + 0.5, 1);
    var top = 0;
    order.forEach(function (k) {
      var n = s.counts[k] || 0;
      if (!n) return;
      var h = (n / total) * RIBBON;
      tag("rect", {
        x: sx.toFixed(2), y: (ry + top).toFixed(2),
        width: w.toFixed(2), height: h.toFixed(2),
        class: "dg-chart-band", "data-status": k
      }, svg);
      top += h;
    });
  });
  tag("rect", { x: x0, y: ry, width: x1 - x0, height: RIBBON, class: "dg-chart-band-frame" }, svg);

  // Where something first went wrong, marked on the time axis. A node passes
  // amber, red and its ceiling within a second or two of a spike, which drew
  // a thicket of lines saying the same thing, so only its first turn counts.
  var placed = [];
  var firstFor = {};
  (events || []).forEach(function (ev) {
    if (ev.ms === undefined || firstFor[ev.label]) return;
    firstFor[ev.label] = true;
    var x = xAt(ev.ms);
    tag("line", { x1: x, x2: x, y1: y0, y2: ry + RIBBON, class: "dg-chart-mark", "data-status": ev.status }, svg);
    // Two labels close together are unreadable stacked, so drop the second
    // unless it can sit on a different line.
    var near = placed.filter(function (px) { return Math.abs(px - x) < 100; });
    if (near.length >= 2) return;
    placed.push(x);
    var t = tag("text", {
      x: Math.min(x + 4, x1 - 60), y: y0 + 10 + near.length * 11,
      class: "dg-chart-mark-label", "data-status": ev.status
    }, svg);
    t.textContent = ev.label;
  });

  // Time axis, in seconds of wall clock.
  [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
    var x = x0 + (x1 - x0) * f;
    tag("text", { x: x, y: H - 16, class: "dg-chart-tick dg-chart-tick-x" }, svg)
      .textContent = (span * f / 1000).toFixed(0) + "s";
  });
  tag("text", { x: x0 - 6, y: y0 - 10, class: "dg-chart-axis dg-chart-tick-l" }, svg).textContent = "rps";
  tag("text", { x: x1 + 6, y: y0 - 10, class: "dg-chart-axis dg-chart-tick-r" }, svg).textContent = "p99 ms";
}

// The same run as a spreadsheet. One row per frame, plus a column per node so
// a reader can chart whatever the built-in view does not show.
// A node called "Auth, OIDC" would otherwise split into two columns.
function csvCell(v) {
  var t = String(v == null ? "" : v);
  return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

export function runToCsv(samples, nodeIds, nodeLabels) {
  var head = ["elapsed_s", "dau", "peak_rps", "p50_ms", "p99_ms", "monthly_cost", "availability",
              "green", "amber", "red", "saturated"];
  nodeIds.forEach(function (id) { head.push("util:" + (nodeLabels[id] || id)); });
  var rows = [head.map(csvCell).join(",")];
  samples.forEach(function (s) {
    var row = [
      (s.ms / 1000).toFixed(2), s.dau, s.rps.toFixed(2), s.p50.toFixed(2), s.p99.toFixed(2),
      s.cost.toFixed(2), (s.availability * 100).toFixed(4),
      s.counts.green || 0, s.counts.amber || 0, s.counts.red || 0, s.counts.saturated || 0
    ];
    nodeIds.forEach(function (id) {
      var u = s.util && s.util[id];
      row.push(u === undefined ? "" : (isFinite(u) ? u.toFixed(4) : "over"));
    });
    rows.push(row.map(csvCell).join(","));
  });
  return rows.join("\n");
}
