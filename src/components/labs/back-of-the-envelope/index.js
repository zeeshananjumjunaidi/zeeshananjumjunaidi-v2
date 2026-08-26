// Orchestrates the calculator tabs: wires the render chain via callbacks (so
// each module only ever imports *earlier* tabs' pure derive functions, never
// a later one -- no circular imports) and the shared Reset button.
import { initTabs } from "./tabs.js";
import { initTraffic } from "./traffic.js";
import { initStorage } from "./storage.js";
import { initCache } from "./cache.js";
import { initBandwidth } from "./bandwidth.js";
import { initCompute } from "./compute.js";
import { initDatabase } from "./database.js";
import { initQueue } from "./queue.js";
import { initLatency } from "./latency.js";
import { initAvailability } from "./availability.js";
import { initExport } from "./export.js";

initTabs();
initExport();

var traffic = initTraffic(function () { storage.render(); });
var storage = initStorage(traffic.state, function () { cache.render(); });
var cache = initCache(traffic.state, storage.state, function () { bandwidth.render(); });
var bandwidth = initBandwidth(traffic.state, function () { compute.render(); });
var compute = initCompute(traffic.state, function () { database.render(); });
var database = initDatabase(traffic.state, storage.state, function () { queue.render(); availability.render(); });
var queue = initQueue(traffic.state, function () {});
var latency = initLatency(function () {});
var availability = initAvailability(traffic.state, function () {});

var resetBtn = document.getElementById("boeReset");
if (resetBtn) {
  resetBtn.addEventListener("click", function () {
    traffic.reset();
    storage.reset();
    cache.reset();
    bandwidth.reset();
    compute.reset();
    database.reset();
    queue.reset();
    latency.reset();
    availability.reset();
    traffic.render();
  });
}

traffic.render();
