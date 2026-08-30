// The picker is rebuilt on every open, since the values it lists are whatever
// the calculator is showing at that moment.
import { catalogue } from "./metrics.js";

var pending = null;

function rows() {
  var dialog = document.getElementById("boeMetricDialog");
  return dialog ? dialog.querySelectorAll(".boe-metric-row") : [];
}

function applyFilter(term) {
  var q = term.trim().toLowerCase();
  var list = document.getElementById("metricList");
  if (!list) return;
  var shown = 0;
  list.querySelectorAll(".boe-metric-group").forEach(function (group) {
    var any = 0;
    group.querySelectorAll(".boe-metric-row").forEach(function (row) {
      var hit = !q || row.dataset.search.indexOf(q) !== -1;
      row.hidden = !hit;
      if (hit) any++;
    });
    group.hidden = any === 0;
    shown += any;
  });
  var empty = document.getElementById("metricEmpty");
  if (empty) empty.hidden = shown > 0;
}

function build(currentId) {
  var list = document.getElementById("metricList");
  if (!list) return;
  list.innerHTML = "";

  catalogue().forEach(function (group) {
    var wrap = document.createElement("div");
    wrap.className = "boe-metric-group";

    var head = document.createElement("div");
    head.className = "boe-metric-group-label";
    head.textContent = group.title;
    wrap.appendChild(head);

    group.items.forEach(function (item) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "boe-metric-row" + (item.id === currentId ? " current" : "");
      row.dataset.id = item.id;
      row.dataset.search = (group.title + " " + item.panel + " " + item.label).toLowerCase();

      var name = document.createElement("span");
      name.className = "boe-metric-name";
      name.textContent = item.label;
      row.appendChild(name);

      var val = document.createElement("span");
      val.className = "boe-metric-val";
      val.textContent = item.value + (item.unit ? " " + item.unit : "");
      row.appendChild(val);

      row.addEventListener("click", function () { choose(item.id); });
      wrap.appendChild(row);
    });

    list.appendChild(wrap);
  });

  var empty = document.createElement("p");
  empty.className = "boe-metric-empty";
  empty.id = "metricEmpty";
  empty.textContent = "Nothing matches that.";
  empty.hidden = true;
  list.appendChild(empty);
}

function choose(id) {
  var dialog = document.getElementById("boeMetricDialog");
  if (pending) pending(id);
  if (dialog && dialog.open) dialog.close();
}

export function openMetricDialog(currentId, onPick) {
  var dialog = document.getElementById("boeMetricDialog");
  if (!dialog) return;
  pending = onPick;
  build(currentId);
  var search = document.getElementById("metricSearch");
  if (search) { search.value = ""; applyFilter(""); }
  dialog.showModal();
  if (search) search.focus();
}

export function initMetricDialog() {
  var dialog = document.getElementById("boeMetricDialog");
  if (!dialog) return;

  var close = document.getElementById("metricClose");
  if (close) close.addEventListener("click", function () { dialog.close(); });

  var clear = document.getElementById("metricClear");
  if (clear) clear.addEventListener("click", function () { choose(null); });

  var search = document.getElementById("metricSearch");
  if (search) {
    search.addEventListener("input", function () { applyFilter(search.value); });
    search.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      for (var i = 0; i < rows().length; i++) {
        if (!rows()[i].hidden) { rows()[i].click(); return; }
      }
    });
  }

  dialog.addEventListener("click", function (e) {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", function () { pending = null; });
}
