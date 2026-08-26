// Tab-bar chrome only -- switching panels, and hiding the blurb/reset row on
// the Diagram tab (a different kind of tool, doesn't fit that framing).
export function initTabs() {
  var tabs = document.querySelectorAll(".boe-tabbtn");
  var panels = document.querySelectorAll(".boe-tab");
  var resetBtn = document.getElementById("boeReset");
  var blurbEl = document.getElementById("boeBlurb");
  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.tab;
      tabs.forEach(function (b) { b.classList.toggle("active", b === btn); });
      panels.forEach(function (p) { p.hidden = p.dataset.tab !== target; });
      // Use visibility (not the hidden attribute) so .boe-head keeps its height on
      // every tab -- hidden would collapse that row and yank the tab bar/content
      // below it upward on Diagram, then snap back down when leaving it.
      var onDiagram = target === "diagram";
      if (resetBtn) resetBtn.style.visibility = onDiagram ? "hidden" : "visible";
      if (blurbEl) blurbEl.style.visibility = onDiagram ? "hidden" : "visible";
    });
  });
}
