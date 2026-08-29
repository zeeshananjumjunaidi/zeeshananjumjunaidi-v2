// Save slots.
//
// Snapshots are taken from the DOM rather than from a parallel copy of each
// tab's state, the same discipline export.js already uses: every calculator
// input carries an id, so one scan captures all ten tabs and any tab added
// later works with no changes here. The two exceptions are the Latency hop
// list (a JS array, not fields -- the module hands it over) and the Diagram
// (owns its own storage; it exchanges data over a `boe:load-diagram` event).
//
// Worked example scenarios were added here and then removed by request --
// this tool ships no preset content, only the user's own saved states.

var SLOT_KEY = "boe-slots-v1";
var DIAGRAM_KEY = "boe-diagram-v1";
export var SLOT_COUNT = 4;

// Diagram inputs are excluded deliberately: that tab keeps its own storage
// and its fields are canvas chrome (zoom, labels), not capacity assumptions.
var FIELD_SELECTOR = '.boe-tab:not([data-tab="diagram"]) input[id]';

function fieldEls() {
  return Array.prototype.slice.call(document.querySelectorAll(FIELD_SELECTOR));
}

function readFields() {
  var out = {};
  fieldEls().forEach(function (el) {
    out[el.id] = el.type === "checkbox" ? el.checked : el.value;
  });
  return out;
}

// Missing keys are left alone rather than reset, so a snapshot taken before a
// new field existed still loads cleanly and the new field keeps its default.
function writeFields(fields) {
  if (!fields) return;
  fieldEls().forEach(function (el) {
    if (!Object.prototype.hasOwnProperty.call(fields, el.id)) return;
    var v = fields[el.id];
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = String(v);
  });
}

function readDiagram() {
  try {
    var raw = localStorage.getItem(DIAGRAM_KEY);
    if (!raw) return null;
    var d = JSON.parse(raw);
    if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.edges)) return null;
    return { nodes: d.nodes, edges: d.edges };
  } catch (e) {
    return null;
  }
}

function loadSlots() {
  try {
    var raw = localStorage.getItem(SLOT_KEY);
    var parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function persistSlots(slots) {
  try {
    localStorage.setItem(SLOT_KEY, JSON.stringify(slots));
    return true;
  } catch (e) {
    // Quota, or storage blocked entirely (private windows, site-data off).
    return false;
  }
}

function stamp() {
  var d = new Date();
  var p = function (x) { return String(x).padStart(2, "0"); };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

export function initPresets(deps) {
  var getHops = deps.getHops;
  var setHops = deps.setHops;
  var renderAll = deps.renderAll;

  var dialog = document.getElementById("boeScenarioDialog");
  var openBtn = document.getElementById("boeScenarioBtn");
  var closeBtn = document.getElementById("scenarioClose");
  var slotWrap = document.getElementById("scenarioSlots");
  var noteEl = document.getElementById("scenarioNote");
  if (!dialog || !openBtn) return;

  function note(msg) {
    if (noteEl) noteEl.textContent = msg || "";
  }

  function snapshot(name) {
    return {
      v: 1,
      name: name || "Saved state",
      savedAt: stamp(),
      fields: readFields(),
      hops: getHops ? getHops() : null,
      diagram: readDiagram()
    };
  }

  function apply(snap) {
    if (!snap) return;
    writeFields(snap.fields);
    if (snap.hops && setHops) setHops(snap.hops);
    if (snap.diagram) {
      document.dispatchEvent(new CustomEvent("boe:load-diagram", { detail: snap.diagram }));
    }
    // One render pass at the end: the cascade in index.js walks Traffic ->
    // ... -> Cost, so every tab picks up the new field values from here.
    renderAll();
  }

  // ---- slots ----
  function renderSlots() {
    if (!slotWrap) return;
    var slots = loadSlots();
    slotWrap.innerHTML = "";
    for (var i = 1; i <= SLOT_COUNT; i++) {
      (function (n) {
        var saved = slots[String(n)];
        var row = document.createElement("div");
        row.className = "boe-slot" + (saved ? " filled" : "");

        var meta = document.createElement("div");
        meta.className = "boe-slot-meta";
        var title = document.createElement("span");
        title.className = "boe-slot-name";
        title.textContent = saved ? saved.name : "Slot " + n;
        var sub = document.createElement("span");
        sub.className = "boe-slot-sub";
        sub.textContent = saved ? saved.savedAt : "empty";
        meta.appendChild(title);
        meta.appendChild(sub);

        var acts = document.createElement("div");
        acts.className = "boe-slot-acts";

        var saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "boe-slot-btn";
        saveBtn.textContent = saved ? "Replace" : "Save";
        saveBtn.addEventListener("click", function () {
          if (saved && !confirm("Replace “" + saved.name + "” with the current state?")) return;
          var name = prompt("Name this snapshot", saved ? saved.name : "Slot " + n);
          if (name === null) return;
          var all = loadSlots();
          all[String(n)] = snapshot(name.trim() || "Slot " + n);
          if (persistSlots(all)) {
            note("Saved to slot " + n + ".");
            renderSlots();
          } else {
            note("Couldn't save. This browser is blocking site storage, or it's full.");
          }
        });
        acts.appendChild(saveBtn);

        if (saved) {
          var loadBtn = document.createElement("button");
          loadBtn.type = "button";
          loadBtn.className = "boe-slot-btn primary";
          loadBtn.textContent = "Load";
          loadBtn.addEventListener("click", function () {
            apply(saved);
            note("Loaded “" + saved.name + "”.");
          });
          acts.appendChild(loadBtn);

          var delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "boe-slot-btn danger";
          delBtn.textContent = "Clear";
          delBtn.addEventListener("click", function () {
            if (!confirm("Clear “" + saved.name + "”? This can't be undone.")) return;
            var all = loadSlots();
            delete all[String(n)];
            persistSlots(all);
            note("Cleared slot " + n + ".");
            renderSlots();
          });
          acts.appendChild(delBtn);
        }

        row.appendChild(meta);
        row.appendChild(acts);
        slotWrap.appendChild(row);
      })(i);
    }
  }

  openBtn.addEventListener("click", function () {
    note("");
    renderSlots();
    dialog.showModal();
  });
  if (closeBtn) closeBtn.addEventListener("click", function () { dialog.close(); });
}
