// Checks on computeGraph. Exported rather than run on import so the same
// suite serves the hidden test panel in the browser and a node runner.

import { computeGraph, GLOBAL_DEFAULTS } from "./engine.js";

function N(id, kind, props, shape) {
  return { id: id, label: id, type: "box", shape: shape || "rect", kind: kind, props: props || {} };
}
function E(from, to, weight) {
  return { id: from + ">" + to, from: from, to: to, weight: weight };
}
function G(over) {
  return Object.assign({}, GLOBAL_DEFAULTS, over || {});
}
function near(a, b, tol) {
  return Math.abs(a - b) <= (tol === undefined ? 1e-6 : tol);
}

var CASES = [];
function test(name, fn) { CASES.push({ name: name, fn: fn }); }

test("peak rps follows dau * rpu * peak / 86400", function () {
  var r = computeGraph({
    globals: G({ dau: 1000000, requestsPerUser: 20, peakMultiplier: 3 }),
    nodes: [N("u", "client"), N("s", "service")],
    edges: [E("u", "s")]
  });
  var want = (1000000 * 20 * 3) / 86400;
  if (!near(r.system.peakRps, want, 1e-9)) throw new Error(r.system.peakRps + " vs " + want);
  if (!near(r.nodes.s.loadRps, want, 1e-9)) throw new Error("service load " + r.nodes.s.loadRps);
});

test("several clients split the user base rather than multiplying it", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("a", "client"), N("b", "client"), N("c", "client"), N("s", "service")],
    edges: [E("a", "s"), E("b", "s"), E("c", "s")]
  });
  if (!near(r.nodes.s.loadRps, r.system.peakRps, 1e-9)) {
    throw new Error("got " + r.nodes.s.loadRps + " want " + r.system.peakRps);
  }
});

test("client share splits the traffic by weight", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),   // 100 rps
    nodes: [N("web", "client", { share: 3 }), N("mob", "client", { share: 1 }),
            N("s", "service", { capacityRps: 10000 })],
    edges: [E("web", "s"), E("mob", "s")]
  });
  if (!near(r.nodes.web.emitsRps, 75, 1e-6)) throw new Error("web " + r.nodes.web.emitsRps);
  if (!near(r.nodes.mob.emitsRps, 25, 1e-6)) throw new Error("mobile " + r.nodes.mob.emitsRps);
  if (!near(r.nodes.s.loadRps, 100, 1e-6)) throw new Error("downstream " + r.nodes.s.loadRps);
  if (!near(r.nodes.web.shareOfTraffic, 0.75, 1e-9)) throw new Error("share " + r.nodes.web.shareOfTraffic);
});

test("changing one client share does not change the total", function () {
  var at = function (share) {
    return computeGraph({
      globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
      nodes: [N("u", "client", { share: share }), N("s", "service", { capacityRps: 10000 })],
      edges: [E("u", "s")]
    });
  };
  // The complaint that started this: a single client with a bigger number on
  // it must not invent traffic. The dial owns the total.
  var one = at(1), ten = at(10);
  if (!near(one.nodes.s.loadRps, ten.nodes.s.loadRps, 1e-9)) {
    throw new Error("total moved: " + one.nodes.s.loadRps + " then " + ten.nodes.s.loadRps);
  }
  if (!near(ten.nodes.u.shareOfTraffic, 1, 1e-9)) throw new Error("sole client should carry all of it");
});

test("a weight of zero means zero, and says so", function () {
  // It used to fall back to an even split when every weight was zeroed, which
  // meant a lone client set to 0 emitted everything. Zero has to mean zero.
  var sole = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client", { share: 0 }), N("s", "service", { capacityRps: 10000 })],
    edges: [E("u", "s")]
  });
  if (sole.nodes.s.loadRps !== 0) throw new Error("sole client at 0 emitted " + sole.nodes.s.loadRps);
  if (sole.nodes.u.emitsRps !== 0) throw new Error("client emitted " + sole.nodes.u.emitsRps);
  if (!sole.warnings.some(function (w) { return /nothing enters/.test(w.text); })) {
    throw new Error("no warning that the system is muted");
  }

  var both = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("a", "client", { share: 0 }), N("b", "client", { share: 0 }),
            N("s", "service", { capacityRps: 10000 })],
    edges: [E("a", "s"), E("b", "s")]
  });
  if (both.nodes.s.loadRps !== 0) throw new Error("two zeroed clients emitted " + both.nodes.s.loadRps);
  if (!both.warnings.some(function (w) { return /Every entry point/.test(w.text); })) {
    throw new Error("no warning for the multi-client case");
  }
});

test("a client knows how many entry points it is one of", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("a", "client"), N("b", "client"), N("s", "service", { capacityRps: 10000 })],
    edges: [E("a", "s"), E("b", "s")]
  });
  if (r.nodes.a.sourceCount !== 2) throw new Error("sourceCount " + r.nodes.a.sourceCount);
});

test("a share of zero alongside a real one mutes that entry point", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("live", "client", { share: 1 }), N("off", "client", { share: 0 }),
            N("a", "service", { capacityRps: 10000 }), N("b", "service", { capacityRps: 10000 })],
    edges: [E("live", "a"), E("off", "b")]
  });
  if (!near(r.nodes.a.loadRps, 100, 1e-6)) throw new Error("live path " + r.nodes.a.loadRps);
  if (r.nodes.b.loadRps !== 0) throw new Error("muted path got " + r.nodes.b.loadRps);
});

test("a client reports what it emits, not a utilization", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { capacityRps: 10000 })],
    edges: [E("u", "s")]
  });
  if (!r.nodes.u.source) throw new Error("client not flagged as a source");
  if (r.nodes.u.serves) throw new Error("a client should not be sized");
  if (!near(r.nodes.u.emitsRps, 100, 1e-6)) throw new Error("emits " + r.nodes.u.emitsRps);
});

test("utilization is load over capacity times instances", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),  // 100 rps
    nodes: [N("u", "client"), N("s", "service", { count: 2, capacityRps: 100 })],
    edges: [E("u", "s")]
  });
  if (!near(r.nodes.s.loadRps, 100, 1e-6)) throw new Error("load " + r.nodes.s.loadRps);
  if (!near(r.nodes.s.utilization, 0.5, 1e-9)) throw new Error("util " + r.nodes.s.utilization);
  if (r.nodes.s.status !== "green") throw new Error("status " + r.nodes.s.status);
});

test("status thresholds are green 60 amber 85 red 100 saturated", function () {
  function utilFor(cap) {
    var r = computeGraph({
      globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
      nodes: [N("u", "client"), N("s", "service", { count: 1, capacityRps: cap })],
      edges: [E("u", "s")]
    });
    return r.nodes.s.status;
  }
  if (utilFor(1000) !== "green") throw new Error("10% should be green");
  if (utilFor(140) !== "amber") throw new Error("71% should be amber");
  if (utilFor(110) !== "red") throw new Error("91% should be red");
  if (utilFor(80) !== "saturated") throw new Error("125% should be saturated");
});

test("M/M/1 queueing matches the closed form rho/(1-rho) * service time", function () {
  // 100 rps, one server, 5ms service. rho = 0.5, so Wq should be 5ms.
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { count: 1, capacityRps: 200, latencyMs: 5 })],
    edges: [E("u", "s")]
  });
  var st = 5, rho = 100 * (st / 1000) / 1;
  var want = (rho / (1 - rho)) * st;
  if (!near(r.nodes.s.queueingMs, want, 0.01)) throw new Error(r.nodes.s.queueingMs + " vs " + want);
});

test("queueing climbs as a node fills and is capped once saturated", function () {
  function wq(cap) {
    var r = computeGraph({
      globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
      nodes: [N("u", "client"), N("s", "service", { count: 1, capacityRps: cap, latencyMs: 5 })],
      edges: [E("u", "s")]
    });
    return r.nodes.s.queueingMs;
  }
  var a = wq(1000), b = wq(200), c = wq(115);
  if (!(a < b && b < c)) throw new Error("not monotonic: " + [a, b, c].join(" "));
  if (!isFinite(wq(50))) throw new Error("saturated node returned a non-finite wait");
});

test("more servers cut the wait at the same utilization", function () {
  function wq(count, capEach) {
    var r = computeGraph({
      globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
      nodes: [N("u", "client"), N("s", "service", { count: count, capacityRps: capEach, latencyMs: 5 })],
      edges: [E("u", "s")]
    });
    return r.nodes.s.queueingMs;
  }
  // Both sit at 50% utilization, but eight servers pool the waiting.
  var one = wq(1, 200), eight = wq(8, 25);
  if (!(eight < one)) throw new Error("M/M/8 " + eight + " should beat M/M/1 " + one);
});

test("a cache passes only its miss rate downstream", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("c", "cache", { hitRate: 90 }), N("d", "db_sql")],
    edges: [E("u", "c"), E("c", "d")]
  });
  if (!near(r.nodes.c.loadRps, 100, 1e-6)) throw new Error("cache load " + r.nodes.c.loadRps);
  if (!near(r.nodes.d.loadRps, 10, 1e-6)) throw new Error("db load " + r.nodes.d.loadRps);
});

test("a CDN passes only its miss rate downstream", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("e", "cdn", { hitRate: 85 }), N("s", "service")],
    edges: [E("u", "e"), E("e", "s")]
  });
  if (!near(r.nodes.s.loadRps, 15, 1e-6)) throw new Error("origin load " + r.nodes.s.loadRps);
});

test("a diamond splits traffic by weight, everything else fans out", function () {
  var split = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("d", null, {}, "diamond"), N("a", "service"), N("b", "service")],
    edges: [E("u", "d"), E("d", "a", 70), E("d", "b", 30)]
  });
  if (!near(split.nodes.a.loadRps, 70, 1e-6)) throw new Error("branch a " + split.nodes.a.loadRps);
  if (!near(split.nodes.b.loadRps, 30, 1e-6)) throw new Error("branch b " + split.nodes.b.loadRps);

  var fan = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service"), N("a", "cache"), N("b", "db_sql")],
    edges: [E("u", "s"), E("s", "a"), E("s", "b")]
  });
  if (!near(fan.nodes.a.loadRps, 100, 1e-6)) throw new Error("fanout a " + fan.nodes.a.loadRps);
  if (!near(fan.nodes.b.loadRps, 100, 1e-6)) throw new Error("fanout b " + fan.nodes.b.loadRps);
});

test("a decision normalizes across its retry branch, not just the forward one", function () {
  // The retry branch loops back and is held out of the flow. If the split
  // ignored it, the 1% dead-letter branch would receive everything instead.
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("call", "service"), N("check", null, {}, "diamond"),
            N("dlq", "queue")],
    edges: [E("u", "call"), E("call", "check"), E("check", "call", 99), E("check", "dlq", 1)]
  });
  if (!near(r.nodes.dlq.loadRps, 1, 1e-6)) throw new Error("dead letter got " + r.nodes.dlq.loadRps);
});

test("a sink ends the path instead of passing load on", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("d", "db_sql"), N("x", "service")],
    edges: [E("u", "d"), E("d", "x")]
  });
  if (r.nodes.x.loadRps !== 0) throw new Error("load leaked past a sink: " + r.nodes.x.loadRps);
});

test("a cycle is broken, flagged, and does not inflate load", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("a", "service"), N("b", "service")],
    edges: [E("u", "a"), E("a", "b"), E("b", "a")]
  });
  if (!near(r.nodes.a.loadRps, 100, 1e-6)) throw new Error("a " + r.nodes.a.loadRps);
  if (!near(r.nodes.b.loadRps, 100, 1e-6)) throw new Error("b " + r.nodes.b.loadRps);
  if (r.backEdges.size !== 1) throw new Error("expected one back edge, got " + r.backEdges.size);
});

test("database capacity scales reads with replicas and writes with shards", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, readWriteRatio: 9 }),
    nodes: [N("u", "client"), N("d", "db_sql", { readCapacityRps: 100, writeCapacityRps: 100, shards: 2, replicas: 1 })],
    edges: [E("u", "d")]
  });
  var d = r.nodes.d;
  if (!near(d.reads, 90, 1e-6)) throw new Error("reads " + d.reads);
  if (!near(d.writes, 10, 1e-6)) throw new Error("writes " + d.writes);
  if (!near(d.readCap, 400, 1e-6)) throw new Error("read cap " + d.readCap);   // 100 * 2 shards * (1+1)
  if (!near(d.writeCap, 200, 1e-6)) throw new Error("write cap " + d.writeCap); // 100 * 2 shards
  if (!near(d.utilization, 90 / 400, 1e-9)) throw new Error("util " + d.utilization);
  if (d.binding !== "reads") throw new Error("binding " + d.binding);
});

test("a queue reports backlog growth when producers outrun consumers", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("q", "queue", { consumerCount: 2, consumerRps: 20, capacityRps: 100000 })],
    edges: [E("u", "q")]
  });
  // 100 in, 40 drained, so 60/s piles up.
  if (!near(r.nodes.q.backlogPerMin, 60 * 60, 1e-6)) throw new Error("backlog " + r.nodes.q.backlogPerMin);
  if (r.nodes.q.binding !== "consumers") throw new Error("binding " + r.nodes.q.binding);
  if (r.nodes.q.status !== "saturated") throw new Error("status " + r.nodes.q.status);
});

test("availability: series multiplies, active-active beats a single instance", function () {
  var single = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { availability: 99, count: 1, redundancy: "none", capacityRps: 1000 })],
    edges: [E("u", "s")]
  });
  if (!near(single.nodes.s.availability, 0.99, 1e-9)) throw new Error("single " + single.nodes.s.availability);

  var pair = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { availability: 99, count: 2, redundancy: "active-active", capacityRps: 1000 })],
    edges: [E("u", "s")]
  });
  // One of two needed: 1 - 0.01^2.
  if (!near(pair.nodes.s.availability, 0.9999, 1e-9)) throw new Error("pair " + pair.nodes.s.availability);

  var chain = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("a", "service", { availability: 99, count: 1, redundancy: "none", capacityRps: 1000 }),
            N("b", "service", { availability: 99, count: 1, redundancy: "none", capacityRps: 1000 })],
    edges: [E("u", "a"), E("a", "b")]
  });
  if (!near(chain.system.availability, 0.99 * 0.99, 1e-9)) throw new Error("series " + chain.system.availability);
});

test("downtime minutes track availability", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { availability: 99.9, count: 1, redundancy: "none", capacityRps: 1000 })],
    edges: [E("u", "s")]
  });
  if (!near(r.system.downtimeMinutesPerYear, 525.6, 0.1)) throw new Error(r.system.downtimeMinutesPerYear);
});

test("headroom is the multiplier at which the first node saturates", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("a", "service", { count: 1, capacityRps: 1000 }),
            N("b", "service", { count: 1, capacityRps: 250 })],
    edges: [E("u", "a"), E("a", "b")]
  });
  if (!near(r.system.headroom, 2.5, 1e-9)) throw new Error("headroom " + r.system.headroom);
  if (r.system.bottleneck.id !== "b") throw new Error("bottleneck " + r.system.bottleneck.id);
});

test("headroom holds under a traffic change", function () {
  function at(dau) {
    return computeGraph({
      globals: G({ dau: dau, requestsPerUser: 10, peakMultiplier: 1 }),
      nodes: [N("u", "client"), N("s", "service", { count: 1, capacityRps: 250 })],
      edges: [E("u", "s")]
    });
  }
  var lo = at(864000);          // 100 rps against 250 capacity
  if (!near(lo.system.headroom, 2.5, 1e-9)) throw new Error("headroom " + lo.system.headroom);
  var hi = at(864000 * 2.5);    // exactly at capacity
  if (!near(hi.system.headroom, 1, 1e-6)) throw new Error("scaled headroom " + hi.system.headroom);
  if (hi.nodes.s.status !== "amber" && hi.nodes.s.status !== "red") throw new Error("status at 100% " + hi.nodes.s.status);
});

test("bottleneck names the busiest node on the path", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("lb", "lb", { count: 2, capacityRps: 100000 }),
            N("api", "service", { count: 4, capacityRps: 400 }),
            N("db", "db_sql", { readCapacityRps: 60, writeCapacityRps: 40, shards: 1, replicas: 0 })],
    edges: [E("u", "lb"), E("lb", "api"), E("api", "db")]
  });
  if (r.system.bottleneck.id !== "db") throw new Error("bottleneck " + r.system.bottleneck.id);
  if (r.system.bottleneck.status !== "saturated") throw new Error("status " + r.system.bottleneck.status);
});

test("autoscaling is off unless asked for", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { count: 1, capacityRps: 50, maxScale: 50 })],
    edges: [E("u", "s")]
  });
  if (r.nodes.s.units !== 1) throw new Error("scaled without being asked: " + r.nodes.s.units);
  if (r.nodes.s.status !== "saturated") throw new Error("status " + r.nodes.s.status);
});

test("horizontal scaling adds instances to hold the target", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, autoscale: true }),
    nodes: [N("u", "client"), N("s", "service", { count: 1, capacityRps: 50, maxScale: 50, targetUtil: 50 })],
    edges: [E("u", "s")]
  });
  // 100 rps, 50 rps each, held at 50%, so four instances.
  if (r.nodes.s.units !== 4) throw new Error("units " + r.nodes.s.units);
  if (r.nodes.s.atCeiling) throw new Error("should not be at the ceiling yet");
  // Utilization reads against the ceiling, not the current size.
  if (!near(r.nodes.s.utilization, 100 / (50 * 50), 1e-9)) throw new Error("util " + r.nodes.s.utilization);
  if (r.nodes.s.status !== "green") throw new Error("status " + r.nodes.s.status);
});

test("scaling is billed at the size actually running", function () {
  var g = { dau: 864000, requestsPerUser: 10, peakMultiplier: 1, autoscale: true };
  var mk = function (over) {
    return computeGraph({
      globals: G(Object.assign({}, g, over)),
      nodes: [N("u", "client"), N("s", "service", { count: 1, capacityRps: 50, costPerHour: 1, maxScale: 50, targetUtil: 50 })],
      edges: [E("u", "s")]
    });
  };
  var lo = mk({});
  if (!near(lo.nodes.s.monthlyCost, 4 * 730, 1e-6)) throw new Error("four instances should bill 4x730, got " + lo.nodes.s.monthlyCost);
  var hi = mk({ dau: 8640000 });
  if (!(hi.nodes.s.monthlyCost > lo.nodes.s.monthlyCost)) throw new Error("ten times the traffic should cost more");
});

test("horizontal scaling stops at its ceiling and then saturates", function () {
  var r = computeGraph({
    globals: G({ dau: 8640000, requestsPerUser: 10, peakMultiplier: 1, autoscale: true }),
    nodes: [N("u", "client"), N("s", "service", { count: 1, capacityRps: 50, maxScale: 4, targetUtil: 100 })],
    edges: [E("u", "s")]
  });
  // 1000 rps against four instances of 50.
  if (r.nodes.s.units !== 4) throw new Error("units " + r.nodes.s.units);
  if (!r.nodes.s.atCeiling) throw new Error("should be at the ceiling");
  if (r.nodes.s.status !== "saturated") throw new Error("status " + r.nodes.s.status);
});

test("vertical scaling runs out sooner than horizontal", function () {
  var base = { count: 1, capacityRps: 50, targetUtil: 100, maxScale: 8 };
  var mk = function (mode) {
    return computeGraph({
      globals: G({ dau: 8640000, requestsPerUser: 10, peakMultiplier: 1, autoscale: true }),
      nodes: [N("u", "client"), N("s", "service", Object.assign({ scaling: mode }, base, { maxScale: mode === "vertical" ? 8 : 40 }))],
      edges: [E("u", "s")]
    });
  };
  var v = mk("vertical"), h = mk("horizontal");
  if (!v.nodes.s.atCeiling) throw new Error("vertical should hit its ceiling at 1000 rps");
  if (h.nodes.s.atCeiling) throw new Error("horizontal should still have room");
  if (v.nodes.s.units !== 1) throw new Error("vertical should stay at one instance, got " + v.nodes.s.units);
  if (!(v.nodes.s.utilization > h.nodes.s.utilization)) throw new Error("vertical should be closer to its wall");
});

test("a database scales on writes, since replicas do not absorb them", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, readWriteRatio: 9, autoscale: true }),
    nodes: [N("u", "client"),
            N("d", "db_sql", { readCapacityRps: 1000, writeCapacityRps: 5, shards: 1, replicas: 2, maxScale: 8, targetUtil: 100 })],
    edges: [E("u", "d")]
  });
  // 10 writes/s against 5 per shard, so it needs to double and can.
  if (!near(r.nodes.d.sizeMult, 2, 1e-6)) throw new Error("size multiplier " + r.nodes.d.sizeMult);
  if (r.nodes.d.binding !== "writes") throw new Error("binding " + r.nodes.d.binding);
});

test("queue consumers are what scales, not the broker", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, autoscale: true }),
    nodes: [N("u", "client"), N("q", "queue", { consumerCount: 1, consumerRps: 20, capacityRps: 100000, maxScale: 50, targetUtil: 100 })],
    edges: [E("u", "q")]
  });
  // 100 rps, 20 each, so five consumers and no backlog.
  if (r.nodes.q.units !== 5) throw new Error("consumers " + r.nodes.q.units);
  if (r.nodes.q.backlogPerMin !== 0) throw new Error("backlog should clear once it scales, got " + r.nodes.q.backlogPerMin);
});

test("a fixed node ignores the global autoscale switch", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, autoscale: true }),
    nodes: [N("u", "client"), N("s", "service", { scaling: "fixed", count: 1, capacityRps: 50, maxScale: 50 })],
    edges: [E("u", "s")]
  });
  if (r.nodes.s.units !== 1) throw new Error("units " + r.nodes.s.units);
  if (r.nodes.s.status !== "saturated") throw new Error("status " + r.nodes.s.status);
});

test("connection demand is caller instances times pool size", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("api", "service", { count: 5, poolSize: 20, capacityRps: 10000 }),
            N("db", "db_sql", { maxConnections: 200, shards: 1, replicas: 0,
                                readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "api"), E("api", "db")]
  });
  if (r.nodes.db.connDemand !== 100) throw new Error("demand " + r.nodes.db.connDemand);
  if (r.nodes.db.connCap !== 200) throw new Error("supply " + r.nodes.db.connCap);
  if (!near(r.nodes.db.connUtil, 0.5, 1e-9)) throw new Error("util " + r.nodes.db.connUtil);
});

test("replicas add connection slots even though they add no write capacity", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("api", "service", { count: 1, poolSize: 10, capacityRps: 10000 }),
            N("db", "db_sql", { maxConnections: 100, shards: 2, replicas: 2,
                                readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "api"), E("api", "db")]
  });
  // 100 per instance, two shards, three copies each.
  if (r.nodes.db.connCap !== 600) throw new Error("supply " + r.nodes.db.connCap);
});

test("connections bind before throughput does, and say so", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("api", "service", { count: 40, poolSize: 20, capacityRps: 10000 }),
            N("db", "db_sql", { maxConnections: 200, shards: 1, replicas: 0,
                                readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "api"), E("api", "db")]
  });
  var db = r.nodes.db;
  // 800 wanted against 200 offered, while throughput is barely touched.
  if (db.binding !== "connections") throw new Error("binding " + db.binding);
  if (db.status !== "saturated") throw new Error("status " + db.status);
  if (!near(db.connUtil, 4, 1e-9)) throw new Error("util " + db.connUtil);
  if (!r.warnings.some(function (w) { return w.nodeId === "db" && /connections/.test(w.text); })) {
    throw new Error("no connection warning");
  }
});

test("scaling the caller out makes the connection wall worse, not better", function () {
  var mk = function (autoscale) {
    return computeGraph({
      globals: G({ dau: 86400000, requestsPerUser: 10, peakMultiplier: 1, autoscale: autoscale }),
      nodes: [N("u", "client"),
              N("api", "service", { count: 2, poolSize: 20, capacityRps: 500, maxScale: 60, targetUtil: 70 }),
              N("db", "db_sql", { maxConnections: 200, shards: 1, replicas: 0,
                                  readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
      edges: [E("u", "api"), E("api", "db")]
    });
  };
  var fixed = mk(false), scaled = mk(true);
  if (!(scaled.nodes.api.units > fixed.nodes.api.units)) throw new Error("api did not scale");
  if (!(scaled.nodes.db.connUtil > fixed.nodes.db.connUtil)) {
    throw new Error("connection pressure should rise with the caller: "
      + fixed.nodes.db.connUtil + " then " + scaled.nodes.db.connUtil);
  }
});

test("every caller on the edge list contributes its own pool", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("a", "service", { count: 2, poolSize: 10, capacityRps: 10000 }),
            N("b", "worker", { count: 3, poolSize: 5, capacityRps: 10000 }),
            N("db", "db_sql", { maxConnections: 1000, shards: 1, replicas: 0,
                                readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "a"), E("a", "b"), E("a", "db"), E("b", "db")]
  });
  // 2 x 10 from the service, 3 x 5 from the worker.
  if (r.nodes.db.connDemand !== 35) throw new Error("demand " + r.nodes.db.connDemand);
});

test("a node with no pool set demands no connections", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("lb", "lb", { count: 9, capacityRps: 1e6 }),
            N("db", "db_sql", { maxConnections: 100, shards: 1, replicas: 0,
                                readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "lb"), E("lb", "db")]
  });
  if (r.nodes.db.connDemand !== 0) throw new Error("demand " + r.nodes.db.connDemand);
  if (r.nodes.db.binding === "connections") throw new Error("should not be connection bound");
});

test("days to full comes off the write rate and the disk it has left", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, readWriteRatio: 9 }),
    nodes: [N("u", "client"),
            N("db", "db_sql", { recordBytes: 1000, replicas: 0, storageGB: 100, maxStorageGB: 200,
                                readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "db")]
  });
  // 10 writes/s x 1000 bytes x 86400 = 864MB a day, with 100GB spare.
  var perDay = 10 * 1000 * 86400;
  if (!near(r.nodes.db.growthBytesPerDay, perDay, 1)) throw new Error("growth " + r.nodes.db.growthBytesPerDay);
  if (!near(r.nodes.db.daysToFull, 100e9 / perDay, 0.01)) throw new Error("days " + r.nodes.db.daysToFull);
  if (!near(r.system.daysToFull, r.nodes.db.daysToFull, 0.01)) throw new Error("system days");
});

test("a disk with no ceiling never reports a fill date", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"),
            N("db", "db_sql", { recordBytes: 1000, maxStorageGB: 0,
                                readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "db")]
  });
  if (isFinite(r.nodes.db.daysToFull)) throw new Error("got " + r.nodes.db.daysToFull);
  if (isFinite(r.system.daysToFull)) throw new Error("system got " + r.system.daysToFull);
});

test("a disk filling within the quarter is warned about", function () {
  var r = computeGraph({
    globals: G({ dau: 8640000, requestsPerUser: 10, peakMultiplier: 1, readWriteRatio: 1 }),
    nodes: [N("u", "client"),
            N("db", "db_sql", { recordBytes: 4000, replicas: 2, storageGB: 10, maxStorageGB: 200,
                                readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "db")]
  });
  if (!(r.nodes.db.daysToFull < 90)) throw new Error("days " + r.nodes.db.daysToFull);
  if (!r.warnings.some(function (w) { return /fills its disk/.test(w.text); })) throw new Error("no disk warning");
});

test("monthly cost is hourly times instances times 730", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { count: 4, costPerHour: 0.5, capacityRps: 1000 })],
    edges: [E("u", "s")]
  });
  if (!near(r.nodes.s.monthlyCost, 0.5 * 4 * 730, 1e-6)) throw new Error(r.nodes.s.monthlyCost);
  if (!near(r.system.cost.compute, 1460, 1e-6)) throw new Error("compute " + r.system.cost.compute);
});

test("database cost bills every shard and replica", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("d", "db_sql", { costPerHour: 1, shards: 3, replicas: 1, readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "d")]
  });
  if (!near(r.system.cost.managed, 1 * 6 * 730, 1e-6)) throw new Error(r.system.cost.managed);
});

test("cost per 1k requests and per DAU follow the total", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { count: 1, costPerHour: 1, capacityRps: 1000 })],
    edges: [E("u", "s")]
  });
  var reqMonth = r.system.peakRps * 2592000;
  if (!near(r.system.costPer1kRequests, (r.system.totalCost / reqMonth) * 1000, 1e-9)) throw new Error("per 1k");
  if (!near(r.system.costPerDauMonth, r.system.totalCost / 864000, 1e-12)) throw new Error("per dau");
});

test("storage grows from writes, record size and replication", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, readWriteRatio: 9 }),
    nodes: [N("u", "client"), N("d", "db_sql", { recordBytes: 1000, replicas: 2, storageGB: 0, readCapacityRps: 1e6, writeCapacityRps: 1e6 })],
    edges: [E("u", "d")]
  });
  // 10 writes/s * 1000 bytes * 3 copies * 86400.
  if (!near(r.system.storagePerDayBytes, 10 * 1000 * 3 * 86400, 1e-3)) throw new Error(r.system.storagePerDayBytes);
  if (!near(r.system.storagePerYearBytes, r.system.storagePerDayBytes * 365, 1e-3)) throw new Error("per year");
});

test("a CDN cuts origin egress but not what the user receives", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, avgResponseBytes: 1000 }),
    nodes: [N("u", "client"), N("e", "cdn", { hitRate: 80 }), N("s", "service")],
    edges: [E("u", "e"), E("e", "s")]
  });
  if (!near(r.system.egressBps, 100 * 1000, 1e-6)) throw new Error("user egress " + r.system.egressBps);
  if (!near(r.system.originEgressBps, 20 * 1000, 1e-6)) throw new Error("origin egress " + r.system.originEgressBps);
});

test("latency sums service, queueing and per-hop network along the path", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1, clientRttMs: 30, netSameAzMs: 1, tailFactor: 3 }),
    nodes: [N("u", "client", { }),
            N("a", "service", { count: 1, capacityRps: 100000, latencyMs: 10 }),
            N("b", "service", { count: 1, capacityRps: 100000, latencyMs: 20 })],
    edges: [E("u", "a"), E("a", "b")]
  });
  // Client 0ms + 30ms internet, then 10ms + 1ms, then 20ms + 1ms. Queueing is
  // negligible at this load.
  if (!near(r.system.p50, 62, 0.5)) throw new Error("p50 " + r.system.p50);
  if (!(r.system.p99 > r.system.p50)) throw new Error("p99 not above p50");
});

test("the critical path is the slowest one", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("d", null, {}, "diamond"),
            N("fast", "service", { latencyMs: 1, capacityRps: 100000 }),
            N("slow", "service", { latencyMs: 500, capacityRps: 100000 })],
    edges: [E("u", "d"), E("d", "fast", 50), E("d", "slow", 50)]
  });
  if (r.critical.nodes.indexOf("slow") === -1) throw new Error("critical path missed the slow branch");
});

test("a node taking load with no capacity is warned about, not silently zeroed", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service", { capacityRps: 0 })],
    edges: [E("u", "s")]
  });
  if (!r.warnings.some(function (w) { return w.level === "warn" && w.nodeId === "s"; })) {
    throw new Error("no warning raised");
  }
  if (r.system.headroom !== 0) throw new Error("headroom should be 0, got " + r.system.headroom);
});

test("containers and text nodes stay out of the computation", function () {
  var r = computeGraph({
    globals: G({ dau: 864000, requestsPerUser: 10, peakMultiplier: 1 }),
    nodes: [N("u", "client"), N("s", "service"),
            { id: "grp", label: "VPC", type: "container" },
            { id: "note", label: "hi", type: "box", shape: "text" }],
    edges: [E("u", "s")]
  });
  if (r.nodes.grp || r.nodes.note) throw new Error("scenery leaked into the results");
});

test("an empty diagram computes without throwing", function () {
  var r = computeGraph({ globals: G(), nodes: [], edges: [] });
  if (r.system.bottleneck !== null) throw new Error("bottleneck on an empty graph");
  if (r.system.totalCost !== 0) throw new Error("cost on an empty graph");
});

test("60 nodes and 120 edges recompute in under 16ms", function () {
  var nodes = [N("u", "client")];
  var edges = [];
  for (var i = 0; i < 59; i++) {
    nodes.push(N("n" + i, i % 5 === 0 ? "db_sql" : "service", { count: 3, capacityRps: 5000, latencyMs: 8 }));
    edges.push(E(i === 0 ? "u" : "n" + (i - 1), "n" + i));
  }
  for (var j = 0; j < 61; j++) {
    edges.push(E("n" + (j % 40), "n" + ((j * 7) % 59)));
  }
  var t0 = (typeof performance !== "undefined" ? performance : Date).now();
  var runs = 20;
  for (var k = 0; k < runs; k++) computeGraph({ globals: G(), nodes: nodes, edges: edges });
  var per = ((typeof performance !== "undefined" ? performance : Date).now() - t0) / runs;
  if (per > 16) throw new Error(per.toFixed(2) + "ms per recompute");
  return per.toFixed(2) + "ms per recompute";
});

export function runTests() {
  return CASES.map(function (c) {
    try {
      var note = c.fn();
      return { name: c.name, pass: true, note: note || "" };
    } catch (e) {
      return { name: c.name, pass: false, note: e && e.message ? e.message : String(e) };
    }
  });
}
