import { getState } from "./run-store.js";
// Scrapes the rendered DOM rather than a per-tab metadata registry, so tabs
// added later export with no changes here.

var META_KEY = "boe-export-meta";
var DIAGRAM_KEY = "boe-diagram-v1";

function fieldLabel(fieldEl) {
  var labelText = fieldEl.querySelector(".boe-label-text");
  if (labelText) return labelText.textContent.trim();
  var label = fieldEl.querySelector(".boe-label");
  if (!label) return "";
  var clone = label.cloneNode(true);
  var unit = clone.querySelector(".boe-unit");
  if (unit) unit.remove();
  return clone.textContent.trim();
}

function fieldValue(fieldEl) {
  var input = fieldEl.querySelector("input, select, textarea");
  if (!input) return null;
  if (input.type === "checkbox") return { value: input.checked ? "yes" : "no", unit: "" };
  var slideVal = fieldEl.querySelector(".boe-slide-val");
  if (slideVal) return { value: slideVal.textContent.trim(), unit: "" };
  var unitEl = fieldEl.querySelector(".boe-unit");
  return { value: input.value, unit: unitEl ? unitEl.textContent.trim() : "" };
}

function outRowValue(rowEl) {
  var label = rowEl.children[0] ? rowEl.children[0].textContent.trim() : "";
  var valEl = rowEl.children[1];
  if (!valEl) return null;
  var clone = valEl.cloneNode(true);
  var unitEl = clone.querySelector(".boe-out-unit");
  var unit = unitEl ? unitEl.textContent.trim() : "";
  if (unitEl) unitEl.remove();
  return { label: label, value: clone.textContent.trim(), unit: unit };
}

export function collectSection(tabKey) {
  var tab = document.querySelector('.boe-tab[data-tab="' + tabKey + '"]');
  if (!tab) return null;
  var panels = [];

  tab.querySelectorAll(".boe-panel").forEach(function (panelEl) {
    var titleEl = panelEl.querySelector(".boe-panel-title");
    var fields = [];

    panelEl.querySelectorAll(".boe-field").forEach(function (fieldEl) {
      if (fieldEl.hidden) return;
      var v = fieldValue(fieldEl);
      if (!v) return;
      fields.push({ label: fieldLabel(fieldEl), value: v.value, unit: v.unit });
    });
    panelEl.querySelectorAll(".boe-toggle").forEach(function (toggleEl) {
      var input = toggleEl.querySelector('input[type="checkbox"]');
      var labelEl = toggleEl.querySelector(".boe-toggle-label");
      fields.push({ label: labelEl ? labelEl.textContent.trim() : "", value: input && input.checked ? "on" : "off", unit: "" });
    });
    panelEl.querySelectorAll(".boe-hop-row").forEach(function (rowEl) {
      var name = rowEl.querySelector(".boe-hop-name");
      var nums = rowEl.querySelectorAll(".boe-hop-num");
      var check = rowEl.querySelector(".boe-hop-check");
      if (!name || nums.length < 2) return;
      var label = name.value + (check && !check.checked ? " (off)" : "");
      fields.push({ label: label, value: nums[0].value + "× " + nums[1].value, unit: "ms" });
    });

    var outputs = [];
    panelEl.querySelectorAll(".boe-out-row").forEach(function (rowEl) {
      var o = outRowValue(rowEl);
      if (o) outputs.push(o);
    });

    if (fields.length || outputs.length) {
      panels.push({ title: titleEl ? titleEl.textContent.trim() : "", fields: fields, outputs: outputs });
    }
  });

  var notes = [];
  tab.querySelectorAll(".boe-flag.on").forEach(function (flagEl) {
    notes.push(flagEl.textContent.trim().replace(/\s+/g, " "));
  });

  var btn = document.querySelector('.boe-tabbtn[data-tab="' + tabKey + '"]');
  return { key: tabKey, title: btn ? btn.textContent.trim() : tabKey, panels: panels, notes: notes };
}

// Nodes carry a "tab::output label" pin. Resolved here rather than importing
// metrics.js, which imports this module.
function resolvePins(nodes) {
  var seen = {};
  var pins = [];
  nodes.forEach(function (n) {
    if (!n || typeof n.metric !== "string") return;
    var at = n.metric.indexOf("::");
    if (at === -1) return;
    var tab = n.metric.slice(0, at);
    var label = n.metric.slice(at + 2);
    if (!(tab in seen)) seen[tab] = collectSection(tab);
    var section = seen[tab];
    var value = "—", unit = "";
    if (section) {
      section.panels.forEach(function (panel) {
        panel.outputs.forEach(function (o) {
          if (o.label === label) { value = o.value; unit = o.unit; }
        });
      });
    }
    pins.push({ node: n.label || n.id, tab: tab, label: label, value: value, unit: unit });
  });
  return pins;
}

// The capacity model and the last load test, shaped for the same section
// pipeline the calculator tabs use. Both are skipped when there is nothing
// to say, so the export dialog never offers an empty checkbox.
function pctOf(x) {
  if (!isFinite(x)) return "over 100%";
  if (x > 0 && x < 0.005) return "<1%";
  return Math.round(x * 100) + "%";
}

function money(x) {
  if (!isFinite(x)) return "n/a";
  if (Math.abs(x) >= 1000) return "$" + Math.round(x).toLocaleString("en-US");
  return "$" + x.toFixed(2);
}

function round(x, d) {
  var f = Math.pow(10, d === undefined ? 1 : d);
  return isFinite(x) ? Math.round(x * f) / f : 0;
}

export function collectCapacity() {
  var st = getState();
  if (!st.result) return null;
  var sys = st.result.system;
  var g = st.globals || {};
  var out = [
    { label: "Peak requests per second", value: String(round(sys.peakRps)), unit: "rps" },
    { label: "Bottleneck", value: sys.bottleneck ? sys.bottleneck.label : "none", unit: "" },
    { label: "Bottleneck utilization", value: sys.bottleneck ? pctOf(sys.bottleneck.utilization) : "n/a", unit: "" },
    { label: "Limited by", value: sys.bottleneck ? sys.bottleneck.binding : "n/a", unit: "" },
    { label: "Headroom", value: isFinite(sys.headroom) ? round(sys.headroom, 2) + "x" : "n/a", unit: "" },
    { label: "Latency p50", value: String(round(sys.p50)), unit: "ms" },
    { label: "Latency p99", value: String(round(sys.p99)), unit: "ms" },
    { label: "End to end availability", value: (sys.availability * 100).toFixed(3), unit: "%" },
    { label: "Downtime per year", value: String(round(sys.downtimeMinutesPerYear)), unit: "min" },
    { label: "Monthly cost", value: money(sys.totalCost), unit: "" },
    { label: "Cost per 1k requests", value: money(sys.costPer1kRequests), unit: "" },
    { label: "Autoscaling", value: g.autoscale ? "on" : "off", unit: "" },
    { label: "Soonest disk full", value: isFinite(sys.daysToFull)
        ? Math.round(sys.daysToFull) + " days" + (sys.fillsFirst ? " (" + sys.fillsFirst.label + ")" : "")
        : "no ceiling set", unit: "" }
  ];

  var head = ["Node", "Kind", "Load rps", "Utilization", "Status", "Limited by", "Scaling", "Running", "Connections", "p50 ms", "$/month"];
  var rows = [];
  Object.keys(st.result.nodes).forEach(function (id) {
    var r = st.result.nodes[id];
    if (!r.serves || !r.onPath) return;
    rows.push([
      r.label, r.kind, String(round(r.loadRps)), pctOf(r.utilization), r.status,
      r.binding || "capacity",
      r.scaling || "fixed",
      r.scaling === "vertical" ? round(r.sizeMult, 2) + "x size" : String(r.units) + " inst",
      r.connCap > 0 ? Math.round(r.connDemand) + " / " + Math.round(r.connCap) : "n/a",
      String(round(r.totalMs)), money(r.monthlyCost)
    ]);
  });
  rows.sort(function (a, b) { return parseFloat(b[2]) - parseFloat(a[2]); });

  var notes = (st.result.warnings || []).map(function (w) { return w.text; });
  notes.push("Capacities, prices and latencies are order-of-magnitude estimates, not quotes.");
  return {
    key: "capacity", title: "Capacity model",
    panels: [{ title: "System", fields: [], outputs: out }],
    table: { title: "Per node, busiest first", head: head, rows: rows },
    notes: notes
  };
}

export function collectLoadTest() {
  var st = getState();
  if (!st.scenario || st.samples.length < 2) return null;
  var peak = st.samples.reduce(function (a, b) { return b.rps > a.rps ? b : a; }, st.samples[0]);
  var worst = st.samples.reduce(function (a, b) { return Math.max(a, b.p99); }, 0);
  var dearest = st.samples.reduce(function (a, b) { return Math.max(a, b.cost); }, 0);
  var out = [
    { label: "Shape", value: st.scenario.label, unit: "" },
    { label: "Duration", value: String(st.scenario.seconds), unit: "s" },
    { label: "Peak traffic reached", value: String(round(peak.rps)), unit: "rps" },
    { label: "Peak daily users", value: Number(peak.dau).toLocaleString("en-US"), unit: "" },
    { label: "Worst p99", value: String(round(worst)), unit: "ms" },
    { label: "Highest monthly cost", value: money(dearest), unit: "" },
    { label: "Samples recorded", value: String(st.samples.length), unit: "" }
  ];
  var WORD = {
    amber: "filling up", red: "nearly full",
    saturated: "over capacity", ceiling: "at its limit"
  };
  var rows = (st.events || []).map(function (e) {
    return [Number(e.dau).toLocaleString("en-US"), e.label, e.detail || WORD[e.status] || e.status];
  });
  var notes = [];
  if (st.note) notes.push(st.note);
  return {
    key: "loadtest", title: "Load test",
    panels: [{ title: "Run", fields: [], outputs: out }],
    table: { title: "What gave way, in order", head: ["Daily users", "Node", "What happened"], rows: rows },
    notes: notes
  };
}

export function collectDiagram() {
  try {
    var raw = localStorage.getItem(DIAGRAM_KEY);
    if (!raw) return { nodes: [], edges: [] };
    var data = JSON.parse(raw);
    return { nodes: data.nodes || [], edges: data.edges || [] };
  } catch (e) {
    return { nodes: [], edges: [] };
  }
}

export function listSectionKeys() {
  var keys = [];
  document.querySelectorAll(".boe-tabbtn").forEach(function (btn) {
    keys.push({ key: btn.dataset.tab, label: btn.textContent.trim() });
  });
  // Offered only when the diagram has actually been computed or run, so the
  // dialog never shows a checkbox that would export nothing.
  if (getState().result) keys.push({ key: "capacity", label: "Capacity model" });
  if (getState().scenario) keys.push({ key: "loadtest", label: "Load test" });
  return keys;
}

export function buildPayload(title, description, selectedKeys) {
  var sections = [];
  selectedKeys.forEach(function (key) {
    if (key === "diagram") {
      var dg = collectDiagram();
      sections.push({ key: "diagram", title: "Diagram", nodes: dg.nodes, edges: dg.edges, pins: resolvePins(dg.nodes) });
    } else if (key === "capacity") {
      var cap = collectCapacity();
      if (cap) sections.push(cap);
    } else if (key === "loadtest") {
      var lt = collectLoadTest();
      if (lt) sections.push(lt);
    } else {
      var s = collectSection(key);
      if (s) sections.push(s);
    }
  });
  return {
    title: title || "Back of the Envelope",
    description: description || "",
    generated: new Date().toISOString().slice(0, 10),
    sections: sections
  };
}

function yamlScalar(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  var s = String(v);
  var needsQuote =
    s === "" ||
    /^\s|\s$/.test(s) ||
    /[:#\[\]{}&*!|>'"%@`]/.test(s) ||
    /^(true|false|null|~|-?\d+(\.\d+)?)$/i.test(s) ||
    s.indexOf("\n") !== -1;
  if (!needsQuote) return s;
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
}

export function toYaml(value, indent) {
  indent = indent || 0;
  var pad = "  ".repeat(indent);
  var lines = [];

  if (Array.isArray(value)) {
    if (value.length === 0) return pad + "[]\n";
    value.forEach(function (item) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        var keys = Object.keys(item);
        var first = true;
        keys.forEach(function (k) {
          var v = item[k];
          var prefix = pad + (first ? "- " : "  ");
          if (v !== null && typeof v === "object") {
            lines.push(prefix + k + ":");
            lines.push(toYaml(v, indent + 2).replace(/\n$/, ""));
          } else {
            lines.push(prefix + k + ": " + yamlScalar(v));
          }
          first = false;
        });
      } else {
        lines.push(pad + "- " + yamlScalar(item));
      }
    });
    return lines.join("\n") + "\n";
  }

  if (value !== null && typeof value === "object") {
    var keys2 = Object.keys(value);
    if (keys2.length === 0) return pad + "{}\n";
    keys2.forEach(function (k) {
      var v = value[k];
      if (v !== null && typeof v === "object") {
        var isEmptyArr = Array.isArray(v) && v.length === 0;
        var isEmptyObj = !Array.isArray(v) && Object.keys(v).length === 0;
        if (isEmptyArr) { lines.push(pad + k + ": []"); return; }
        if (isEmptyObj) { lines.push(pad + k + ": {}"); return; }
        lines.push(pad + k + ":");
        lines.push(toYaml(v, indent + 1).replace(/\n$/, ""));
      } else {
        lines.push(pad + k + ": " + yamlScalar(v));
      }
    });
    return lines.join("\n") + "\n";
  }

  return pad + yamlScalar(value) + "\n";
}

function escapeMd(s) {
  return String(s).replace(/\|/g, "\\|");
}

export function toMarkdown(payload) {
  var lines = [];
  lines.push("# " + payload.title);
  lines.push("");
  if (payload.description) {
    lines.push(payload.description);
    lines.push("");
  }
  lines.push("_Generated " + payload.generated + "_");
  lines.push("");

  payload.sections.forEach(function (section) {
    lines.push("## " + section.title);
    lines.push("");
    if (section.key === "diagram") {
      if (section.pins && section.pins.length) {
        lines.push("Numbers pinned to nodes:");
        lines.push("");
        lines.push("| Node | Metric | Value |");
        lines.push("| --- | --- | --- |");
        section.pins.forEach(function (pin) {
          lines.push("| " + pin.node + " | " + pin.label + " | " + pin.value + (pin.unit ? " " + pin.unit : "") + " |");
        });
        lines.push("");
      }
      lines.push("Diagram data (re-importable via the Diagram tab's Import button):");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify({ nodes: section.nodes, edges: section.edges }, null, 2));
      lines.push("```");
      lines.push("");
      return;
    }
    section.panels.forEach(function (panel) {
      if (panel.title) {
        lines.push("### " + panel.title);
        lines.push("");
      }
      var rows = panel.fields.concat(panel.outputs);
      if (rows.length) {
        lines.push("| Label | Value |");
        lines.push("| --- | --- |");
        rows.forEach(function (r) {
          var val = r.value + (r.unit ? " " + r.unit : "");
          lines.push("| " + escapeMd(r.label) + " | " + escapeMd(val) + " |");
        });
        lines.push("");
      }
    });
    // A wide grid of its own, which the label/value shape above cannot carry.
    if (section.table && section.table.rows.length) {
      if (section.table.title) {
        lines.push("### " + section.table.title);
        lines.push("");
      }
      lines.push("| " + section.table.head.join(" | ") + " |");
      lines.push("| " + section.table.head.map(function () { return "---"; }).join(" | ") + " |");
      section.table.rows.forEach(function (r) {
        lines.push("| " + r.map(escapeMd).join(" | ") + " |");
      });
      lines.push("");
    }
    if (section.notes.length) {
      section.notes.forEach(function (note) {
        lines.push("> " + note);
        lines.push("");
      });
    }
  });

  return lines.join("\n");
}

export function slugify(s) {
  var out = (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return out || "back-of-the-envelope";
}

export function downloadBlob(filename, mime, text) {
  var blob = new Blob([text], { type: mime });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildPrintDiagramBlock(section) {
  var wrap = document.createElement("div");
  wrap.className = "boe-print-diagram";
  if (!section.nodes.length) {
    wrap.textContent = "No diagram content.";
    return wrap;
  }
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  section.nodes.forEach(function (nd) {
    minX = Math.min(minX, nd.x);
    minY = Math.min(minY, nd.y);
    maxX = Math.max(maxX, nd.x + nd.w);
    maxY = Math.max(maxY, nd.y + nd.h);
  });
  var pad = 24;
  var w = maxX - minX + pad * 2;
  var h = maxY - minY + pad * 2;
  var liveViewport = document.getElementById("dgViewport");
  var clone = liveViewport ? liveViewport.cloneNode(true) : null;
  if (clone) {
    clone.style.transform = "translate(" + (pad - minX) + "px, " + (pad - minY) + "px)";
    clone.querySelectorAll("[contenteditable]").forEach(function (el) { el.removeAttribute("contenteditable"); });
    // Strip ids so the static clone doesn't duplicate the live diagram's.
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach(function (el) { el.removeAttribute("id"); });
  }

  var maxPrintWidth = 680;
  var scale = w > maxPrintWidth ? maxPrintWidth / w : 1;
  wrap.style.width = w * scale + "px";
  wrap.style.height = h * scale + "px";

  var inner = document.createElement("div");
  inner.style.width = w + "px";
  inner.style.height = h + "px";
  inner.style.transform = "scale(" + scale + ")";
  inner.style.transformOrigin = "top left";
  if (clone) inner.appendChild(clone);
  wrap.appendChild(inner);
  return wrap;
}

function el(tag, className, text) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function buildPrintView(container, payload) {
  container.innerHTML = "";
  container.appendChild(el("h1", "boe-print-title", payload.title));
  if (payload.description) container.appendChild(el("p", "boe-print-desc", payload.description));
  container.appendChild(el("p", "boe-print-meta", "Generated " + payload.generated));

  payload.sections.forEach(function (section) {
    container.appendChild(el("h2", "boe-print-h2", section.title));
    if (section.key === "diagram") {
      container.appendChild(buildPrintDiagramBlock(section));
      return;
    }
    section.panels.forEach(function (panel) {
      if (panel.title) container.appendChild(el("h3", "boe-print-h3", panel.title));
      var rows = panel.fields.concat(panel.outputs);
      if (!rows.length) return;
      var table = document.createElement("table");
      table.className = "boe-print-table";
      rows.forEach(function (r) {
        var tr = document.createElement("tr");
        tr.appendChild(el("td", "boe-print-label", r.label));
        tr.appendChild(el("td", "boe-print-value", r.value + (r.unit ? " " + r.unit : "")));
        table.appendChild(tr);
      });
      container.appendChild(table);
    });
    if (section.table && section.table.rows.length) {
      if (section.table.title) container.appendChild(el("h3", "boe-print-h3", section.table.title));
      var wide = document.createElement("table");
      wide.className = "boe-print-table boe-print-grid";
      var hr = document.createElement("tr");
      section.table.head.forEach(function (h) { hr.appendChild(el("th", "boe-print-th", h)); });
      wide.appendChild(hr);
      section.table.rows.forEach(function (r) {
        var tr = document.createElement("tr");
        r.forEach(function (c) { tr.appendChild(el("td", "boe-print-value", c)); });
        wide.appendChild(tr);
      });
      container.appendChild(wide);
    }
    section.notes.forEach(function (note) {
      container.appendChild(el("p", "boe-print-note", note));
    });
  });
}

export function saveMeta(title, description) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ title: title, description: description }));
  } catch (e) {}
}

export function loadMeta() {
  try {
    var raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : { title: "", description: "" };
  } catch (e) {
    return { title: "", description: "" };
  }
}

export function initExport() {
  var openBtn = document.getElementById("boeExportBtn");
  var dialog = document.getElementById("boeExportDialog");
  if (!openBtn || !dialog) return;

  var titleEl = document.getElementById("exportTitle");
  var descEl = document.getElementById("exportDescription");
  var sectionsEl = document.getElementById("exportSections");
  var selectAllEl = document.getElementById("exportSelectAll");
  var closeBtn = document.getElementById("exportClose");
  var printRoot = document.getElementById("boeExportPrint");
  // The print stylesheet targets `body > *`, so this has to be a direct
  // child of <body>, not wherever the component tree placed it.
  if (printRoot && printRoot.parentElement !== document.body) {
    document.body.appendChild(printRoot);
  }

  var meta = loadMeta();
  titleEl.value = meta.title || "";
  descEl.value = meta.description || "";

  function persistMeta() { saveMeta(titleEl.value, descEl.value); }
  titleEl.addEventListener("input", persistMeta);
  descEl.addEventListener("input", persistMeta);

  // Rebuilt each time the dialog opens. The capacity and load-test sections
  // only exist once the diagram has been computed or run, which happens after
  // this module is initialised, so a list built once at load would miss them.
  var sectionInputs = [];

  function buildSections() {
    var was = {};
    sectionInputs.forEach(function (i) { was[i.dataset.key] = i.checked; });
    sectionsEl.innerHTML = "";
    listSectionKeys().forEach(function (s) {
      var label = document.createElement("label");
      label.className = "boe-export-check";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.checked = was[s.key] === undefined ? true : was[s.key];
      input.dataset.key = s.key;
      input.addEventListener("change", syncSelectAll);
      label.appendChild(input);
      label.appendChild(document.createTextNode(s.label));
      sectionsEl.appendChild(label);
    });
    sectionInputs = Array.prototype.slice.call(sectionsEl.querySelectorAll("input[type=checkbox]"));
    syncSelectAll();
  }

  function syncSelectAll() {
    var checked = sectionInputs.filter(function (i) { return i.checked; });
    selectAllEl.checked = sectionInputs.length > 0 && checked.length === sectionInputs.length;
    selectAllEl.indeterminate = checked.length > 0 && checked.length < sectionInputs.length;
  }
  selectAllEl.addEventListener("change", function () {
    sectionInputs.forEach(function (i) { i.checked = selectAllEl.checked; });
    selectAllEl.indeterminate = false;
  });
  buildSections();

  function selectedKeys() {
    return sectionInputs.filter(function (i) { return i.checked; })
      .map(function (i) { return i.dataset.key; });
  }

  openBtn.addEventListener("click", function () { buildSections(); dialog.showModal(); });
  closeBtn.addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) dialog.close();
  });

  document.getElementById("exportYaml").addEventListener("click", function () {
    var payload = buildPayload(titleEl.value, descEl.value, selectedKeys());
    var doc = { title: payload.title, description: payload.description, generated: payload.generated, sections: {} };
    payload.sections.forEach(function (s) {
      if (s.key === "diagram") doc.sections.diagram = { pinned: s.pins, nodes: s.nodes, edges: s.edges };
      else doc.sections[s.key] = {
        title: s.title, panels: s.panels, notes: s.notes,
        table: s.table ? { head: s.table.head, rows: s.table.rows } : undefined
      };
    });
    downloadBlob(slugify(payload.title) + ".yaml", "text/yaml", toYaml(doc));
    dialog.close();
  });

  document.getElementById("exportMarkdown").addEventListener("click", function () {
    var payload = buildPayload(titleEl.value, descEl.value, selectedKeys());
    downloadBlob(slugify(payload.title) + ".md", "text/markdown", toMarkdown(payload));
    dialog.close();
  });

  document.getElementById("exportPdf").addEventListener("click", function () {
    var payload = buildPayload(titleEl.value, descEl.value, selectedKeys());
    buildPrintView(printRoot, payload);
    dialog.close();
    window.print();
  });
}
