// computeGraph: the whole diagram as one number.
//
// Traffic enters at client nodes, flows along edges, and every node it touches
// reports what that load does to it. Pure, no DOM, so it can be tested headless
// and called on every frame of a slider drag.
//
// FORMULAS
//   Peak RPS          dau * requestsPerUser * peakMultiplier / 86400
//   Utilization       load / (capacity per instance * instances)
//   Queueing delay    M/M/c via the Erlang C formula, Wq = C / (c/St - load),
//                     where c is max(instances, capacity * service time) by
//                     Little's law so the wait agrees with the utilization.
//                     Erlang C comes off the numerically stable Erlang B
//                     recursion B(k) = aB(k-1) / (k + aB(k-1)), so a 500
//                     instance node does not overflow a factorial.
//   Tail latency      p99 per node = (service + queueing) * tail factor,
//                     tail factor = base * (1 + 2 * utilization^2), so a node
//                     at 100% has a 9x tail where an idle one has 3x.
//   Availability      none            p
//                     active-passive  1 - (1-p)^2
//                     active-active   sum(i=K..N) C(N,i) p^i (1-p)^(N-i)
//                     multi-az        active-active * per-AZ availability
//                     series          product over the nodes on a path
//                     parallel        1 - product of (1 - a)
//   Downtime          (1 - availability) * 525600 minutes per year
//   Headroom          min over loaded nodes of capacity / load. Load is linear
//                     in DAU, so this is the traffic multiplier at which the
//                     first node saturates without having to search for it.
//   Connections       demand = caller instances * pool size, summed over
//                     every caller. Supply = max connections * instances.
//                     The one limit that tightens as the caller scales out:
//                     forty pods holding twenty each is eight hundred, and a
//                     Postgres offering two hundred is out long before CPU is.
//   Storage per year  writes/s * bytes/write * (1 + replicas) * 86400 * 365
//   Days to full      (disk capacity - held today) / growth per day
//   Egress per month  responses/s * response bytes * 2592000, less CDN hits
//   Monthly cost      $/hr * instances * 730, plus storage and egress
//
// Every price and capacity default is an estimate, not a quote.

import { kindOf, propsOf, KINDS, scalingOf } from "./node-types.js";

export const GLOBAL_DEFAULTS = {
  dau: 1000000,
  requestsPerUser: 20,
  peakMultiplier: 3,
  readWriteRatio: 10,
  avgRequestBytes: 2048,
  avgResponseBytes: 8192,
  retentionDays: 365,
  clientRttMs: 30,
  netSameAzMs: 1,
  netCrossAzMs: 2,
  netCrossRegionMs: 60,
  azAvailability: 99.995,
  autoscale: false,
  tailFactor: 3
};

const HOURS_PER_MONTH = 730;
const SECONDS_PER_MONTH = 2592000;
const MINUTES_PER_YEAR = 525600;
const MAX_PATHS = 400;
const MAX_DEPTH = 48;

function num(v, fallback) {
  var x = typeof v === "number" ? v : parseFloat(v);
  return isFinite(x) ? x : fallback;
}

// Erlang B by recursion, then Erlang C from it. Both take offered load in
// erlangs (a = load * serviceTime) and a server count.
function erlangC(a, c, rho) {
  var b = 1;
  for (var k = 1; k <= c; k++) b = (a * b) / (k + a * b);
  var denom = 1 - rho * (1 - b);
  return denom > 0 ? b / denom : 1;
}

// Instances, capacity and service time are three numbers for two degrees of
// freedom, and they can disagree: 5ms of work per request means one thread
// tops out near 200 rps, whatever capacity was typed in. Little's law settles
// it. Declared capacity times service time is the concurrency that capacity
// implies, and a node has at least as many channels as it has instances, so
// take the larger. Utilization in the wait then matches the badge exactly.
function channelsFor(capacityTotal, serviceMs, count) {
  var implied = capacityTotal * (serviceMs / 1000);
  return Math.max(1, Math.round(Math.max(count || 1, implied)));
}

function queueingMs(load, serviceMs, capacityTotal, count) {
  if (load <= 0 || serviceMs <= 0 || capacityTotal <= 0) return 0;
  var st = serviceMs / 1000;
  var c = channelsFor(capacityTotal, serviceMs, count);
  var rho = load / capacityTotal;
  // Past saturation the real answer is unbounded. Cap it so the number stays
  // renderable, and let `saturated` carry the truth.
  if (rho >= 0.999) return serviceMs * 50;
  var ec = erlangC(load * st, c, rho);
  var wq = ec / (c / st - load);
  return Math.min(Math.max(wq, 0) * 1000, serviceMs * 50);
}

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  var r = 1;
  for (var i = 1; i <= k; i++) r = (r * (n - i + 1)) / i;
  return r;
}

function nodeAvailability(p, count, redundancy, needed, azAvail) {
  if (p >= 1) return 1;
  if (p <= 0) return 0;
  var n = Math.max(1, Math.round(count));
  var k = Math.min(Math.max(1, Math.round(needed || 1)), n);
  if (redundancy === "none") return p;
  if (redundancy === "active-passive") return 1 - Math.pow(1 - p, Math.min(n, 2));
  var acc = 0;
  for (var i = k; i <= n; i++) acc += choose(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i);
  if (redundancy === "multi-az") acc *= azAvail;
  return Math.min(acc, 1);
}

// How far a node stretches under load, and what that size costs.
//
// `units` is what runs right now, which is what gets billed. `ceiling` is the
// most it could ever be, which is what utilization is measured against: a
// working autoscaler holds its target forever, so charting the instantaneous
// ratio would paint every scaling node amber and say nothing. Against the
// ceiling the bar answers the useful question, how close to the wall. A fixed
// node is just the case where the two are equal.
function stretch(mode, baseUnits, perUnit, load, target, maxScale) {
  var flat = { units: baseUnits, sizeMult: 1, current: perUnit * baseUnits, ceiling: perUnit * baseUnits, atCeiling: false };
  if (mode === "fixed" || perUnit <= 0 || baseUnits <= 0) return flat;
  var want = load / Math.max(perUnit * target, 1e-9);
  if (mode === "horizontal") {
    var cap = Math.max(baseUnits, maxScale);
    var units = Math.min(Math.max(Math.ceil(want), baseUnits), cap);
    return { units: units, sizeMult: 1, current: perUnit * units, ceiling: perUnit * cap, atCeiling: units >= cap };
  }
  // Vertical: one box, bigger, and the ceiling arrives much sooner.
  var mult = Math.min(Math.max(want / baseUnits, 1), maxScale);
  return {
    units: baseUnits, sizeMult: mult,
    current: perUnit * baseUnits * mult,
    ceiling: perUnit * baseUnits * maxScale,
    atCeiling: mult >= maxScale - 1e-9
  };
}

// What one node can absorb, and what part of it is binding. Databases and
// queues answer this differently enough to be worth branching on.
function capacityOf(kind, p, load, rShare, mode) {
  var count = Math.max(1, num(p.count, 1));
  var target = Math.min(Math.max(num(p.targetUtil, 70), 1), 100) / 100;
  var maxScale = Math.max(1, num(p.maxScale, 1));
  if (kind === "db_sql" || kind === "db_nosql") {
    var shards = Math.max(1, num(p.shards, 1));
    var replicas = Math.max(0, num(p.replicas, 0));
    // Replicas take reads. Writes land on every copy, so they do not scale.
    var reads = load * rShare;
    var writes = load * (1 - rShare);
    // Writes bind: replicas absorb reads, they do not absorb writes, so
    // growing this node has to be driven by the write rate.
    var perShardWrite = num(p.writeCapacityRps, 0);
    var st = stretch(mode, shards, perShardWrite, writes, target, maxScale);
    var grow = mode === "vertical" ? st.sizeMult : 1;
    var units = mode === "horizontal" ? st.units : shards;
    var ceilUnits = mode === "horizontal" ? Math.max(shards, maxScale) : shards;
    var ceilGrow = mode === "vertical" ? maxScale : 1;
    var readCap = num(p.readCapacityRps, 0) * units * grow * (1 + replicas);
    var writeCap = perShardWrite * units * grow;
    var readCeil = num(p.readCapacityRps, 0) * ceilUnits * ceilGrow * (1 + replicas);
    var writeCeil = perShardWrite * ceilUnits * ceilGrow;
    var ru = readCeil > 0 ? reads / readCeil : (reads > 0 ? Infinity : 0);
    var wu = writeCeil > 0 ? writes / writeCeil : (writes > 0 ? Infinity : 0);
    return {
      total: readCeil + writeCeil,
      current: readCap + writeCap,
      util: Math.max(ru, wu),
      servers: units,
      units: units, sizeMult: grow, atCeiling: st.atCeiling,
      binding: wu >= ru ? "writes" : "reads",
      reads: reads, writes: writes, readCap: readCap, writeCap: writeCap,
      // Every copy accepts connections, so replicas add slots even though
      // they add no write capacity.
      connCap: num(p.maxConnections, 0) * units * (1 + replicas),
      connCapCeil: num(p.maxConnections, 0) * ceilUnits * (1 + replicas)
    };
  }
  if (kind === "queue") {
    // The broker rarely runs out. Consumers do, so they are what scales.
    var baseConsumers = Math.max(0, num(p.consumerCount, 0));
    var perConsumer = Math.max(0, num(p.consumerRps, 0));
    var cs = stretch(mode, Math.max(1, baseConsumers), perConsumer, load, target, maxScale);
    var drain = baseConsumers > 0 ? cs.current : 0;
    var drainCeil = baseConsumers > 0 ? cs.ceiling : 0;
    var ingest = num(p.capacityRps, 0) * count;
    var iu = ingest > 0 ? load / ingest : (load > 0 ? Infinity : 0);
    var du = drainCeil > 0 ? load / drainCeil : (load > 0 ? Infinity : 0);
    return {
      total: Math.min(ingest || Infinity, drainCeil || Infinity),
      current: Math.min(ingest || Infinity, drain || Infinity),
      util: Math.max(iu, du),
      servers: Math.max(1, Math.round(cs.units)),
      units: cs.units, sizeMult: 1, atCeiling: cs.atCeiling,
      binding: du >= iu ? "consumers" : "ingest",
      drain: drain, ingest: ingest
    };
  }
  if (kind === "external_api") {
    var limit = num(p.rateLimitRps, 0);
    return { total: limit, util: limit > 0 ? load / limit : (load > 0 ? Infinity : 0), servers: 1, binding: "rate limit" };
  }
  var per = num(p.capacityRps, 0);
  var gs = stretch(mode, count, per, load, target, maxScale);
  return {
    total: gs.ceiling, current: gs.current,
    util: gs.ceiling > 0 ? load / gs.ceiling : (load > 0 ? Infinity : 0),
    servers: gs.units, units: gs.units, sizeMult: gs.sizeMult, atCeiling: gs.atCeiling,
    binding: "capacity"
  };
}

function statusOf(util) {
  if (!isFinite(util)) return "saturated";
  if (util > 1) return "saturated";
  if (util > 0.85) return "red";
  if (util > 0.6) return "amber";
  return "green";
}

// Billed on the size actually running, so autoscaling shows up as a bill
// rather than as free capacity.
function costOf(kind, p, load, egressBytesMonth, cap) {
  var count = Math.max(1, num(p.count, 1));
  var units = cap && cap.units ? cap.units : count;
  var sizeMult = cap && cap.sizeMult ? cap.sizeMult : 1;
  var hourly = num(p.costPerHour, 0);
  var out = { compute: 0, storage: 0, network: 0, managed: 0 };
  if (kind === "client" || kind === "none") return out;

  if (kind === "db_sql" || kind === "db_nosql") {
    var instances = Math.max(1, units) * (1 + Math.max(0, num(p.replicas, 0)));
    out.managed = hourly * instances * sizeMult * HOURS_PER_MONTH;
    return out;
  }
  if (kind === "queue" || kind === "search") {
    out.managed = hourly * units * sizeMult * HOURS_PER_MONTH;
    return out;
  }
  if (kind === "external_api") {
    out.managed = num(p.costPerCall, 0) * load * SECONDS_PER_MONTH;
    return out;
  }
  if (kind === "object_storage") {
    out.storage = num(p.storageGB, 0) * num(p.costPerGBMonth, 0);
    out.network = (egressBytesMonth / 1e9) * num(p.egressCostPerGB, 0);
    return out;
  }
  if (kind === "cdn") {
    out.network = (egressBytesMonth / 1e9) * num(p.egressCostPerGB, 0);
    return out;
  }
  out.compute = hourly * units * sizeMult * HOURS_PER_MONTH;
  return out;
}

export function computeGraph(state) {
  var g = Object.assign({}, GLOBAL_DEFAULTS, state.globals || {});
  var allNodes = (state.nodes || []).filter(function (n) { return n && n.id; });
  var warnings = [];

  // Containers and text are scenery. Diamonds route but do no work, so they
  // stay in the graph for propagation and are skipped for capacity.
  var nodes = allNodes.filter(function (n) { return n.type !== "container" && n.shape !== "text"; });
  var byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });

  var edges = (state.edges || []).filter(function (e) { return e && byId[e.from] && byId[e.to]; });

  var rw = Math.max(0, num(g.readWriteRatio, 10));
  var rShare = rw / (rw + 1);
  var peakRps = (num(g.dau, 0) * num(g.requestsPerUser, 0) * num(g.peakMultiplier, 1)) / 86400;

  var out = {}, inc = {};
  nodes.forEach(function (n) { out[n.id] = []; inc[n.id] = []; });
  edges.forEach(function (e) { out[e.from].push(e); inc[e.to].push(e); });

  // Cycles cannot propagate steady-state load, so break them the way the
  // layout does: DFS from the sources, and any edge back onto the current
  // stack is dropped from the flow and reported.
  var back = new Set();
  {
    var mark = {};
    var walk = function (id) {
      mark[id] = 1;
      out[id].forEach(function (e) {
        if (mark[e.to] === 1) { back.add(e); return; }
        if (!mark[e.to]) walk(e.to);
      });
      mark[id] = 2;
    };
    nodes.forEach(function (n) { if (!inc[n.id].length && !mark[n.id]) walk(n.id); });
    nodes.forEach(function (n) { if (!mark[n.id]) walk(n.id); });
  }
  var fwd = edges.filter(function (e) { return !back.has(e); });
  if (back.size) {
    warnings.push({
      level: "info",
      text: back.size === 1
        ? "One edge loops back and is held out of the flow, so a retry is not counted as new traffic."
        : back.size + " edges loop back and are held out of the flow, so retries are not counted as new traffic."
    });
  }

  var fOut = {}, fIn = {}, indeg = {};
  nodes.forEach(function (n) { fOut[n.id] = []; fIn[n.id] = []; indeg[n.id] = 0; });
  fwd.forEach(function (e) { fOut[e.from].push(e); fIn[e.to].push(e); indeg[e.to]++; });

  // Sources: the client nodes if any were drawn, otherwise whatever has
  // nothing feeding it, so a diagram without a User box still computes.
  // A client box with something pointing at it is an endpoint being called,
  // like a webhook receiver, not another crowd of users. Only the ones with
  // nothing upstream generate load.
  var sources = nodes.filter(function (n) { return KINDS[kindOf(n)].source && !fIn[n.id].length; });
  if (!sources.length) {
    sources = nodes.filter(function (n) { return !fIn[n.id].length && kindOf(n) !== "none"; });
    if (sources.length) {
      warnings.push({ level: "info", text: "No client node found, so traffic starts at the " + sources.length + " node(s) with nothing upstream." });
    }
  }
  if (!sources.length && nodes.length) {
    warnings.push({ level: "warn", text: "Nothing to drive traffic from. Add a node with a client icon." });
  }

  // Every client box is one share of the same user base, so drawing three of
  // them splits the traffic rather than tripling it. The split is weighted, so
  // a mobile app carrying twice the web traffic can say so. Equal weights, the
  // default, come out as an even split.
  var shareOf = {};
  var shareTotal = 0;
  sources.forEach(function (n) {
    var w = Math.max(0, num(propsOf(n).share, 1));
    shareOf[n.id] = w;
    shareTotal += w;
  });
  // Zero means zero. An earlier version quietly fell back to an even split
  // when every weight was zeroed, so a lone client set to 0 emitted everything,
  // which is the opposite of what the number says. Say what happened instead.
  if (shareTotal <= 0 && sources.length) {
    warnings.push({
      level: "warn",
      text: sources.length === 1
        ? "The traffic weight on " + (sources[0].label || sources[0].id) + " is 0, so nothing enters the system."
        : "Every entry point has a traffic weight of 0, so nothing enters the system."
    });
  }
  var isSource = {};
  sources.forEach(function (n) { isSource[n.id] = true; });

  var order = [];
  {
    var deg = {};
    nodes.forEach(function (n) { deg[n.id] = indeg[n.id]; });
    var queue = nodes.filter(function (n) { return deg[n.id] === 0; }).map(function (n) { return n.id; });
    while (queue.length) {
      var id = queue.shift();
      order.push(id);
      fOut[id].forEach(function (e) { if (--deg[e.to] === 0) queue.push(e.to); });
    }
    nodes.forEach(function (n) { if (order.indexOf(n.id) === -1) order.push(n.id); });
  }

  var load = {}, edgeRps = {};
  nodes.forEach(function (n) { load[n.id] = 0; });

  order.forEach(function (id) {
    var node = byId[id];
    var kind = kindOf(node);
    var p = propsOf(node);
    if (isSource[id] && shareTotal > 0) load[id] += peakRps * (shareOf[id] / shareTotal);
    var arriving = load[id];

    var pass = KINDS[kind].pass;
    var leaving = arriving;
    if (pass === "miss") leaving = arriving * (1 - Math.min(1, Math.max(0, num(p.hitRate, 0) / 100)));
    else if (pass === "sink") leaving = 0;

    var outs = fOut[id];
    if (!outs.length) return;

    // A diamond is a decision, so its weights split one request between the
    // branches. Everything else fans out: a service calling a cache and a
    // database does both, and each edge carries the full rate.
    if (node.shape === "diamond") {
      // Normalize across every branch, including the ones that loop back,
      // but only deliver down the forward ones. A retry branch still claims
      // its share; that share just re-enters upstream instead of counting as
      // new load. Without this, a decision whose only forward branch is the
      // dead letter queue sends everything there whatever weight was set.
      var sum = out[id].reduce(function (a, e) { return a + Math.max(0, num(e.weight, 1)); }, 0) || 1;
      outs.forEach(function (e) {
        var share = (leaving * Math.max(0, num(e.weight, 1))) / sum;
        edgeRps[e.id || e.from + ">" + e.to] = share;
        load[e.to] += share;
      });
    } else {
      outs.forEach(function (e) {
        var r = leaving * Math.max(0, num(e.weight, 1));
        edgeRps[e.id || e.from + ">" + e.to] = r;
        load[e.to] += r;
      });
    }
  });

  // Bandwidth first, so per-node egress cost has something to charge against.
  var cdnHit = 0, cdnSeen = 0;
  nodes.forEach(function (n) {
    if (kindOf(n) !== "cdn") return;
    var p = propsOf(n);
    cdnSeen += load[n.id];
    cdnHit += load[n.id] * Math.min(1, Math.max(0, num(p.hitRate, 0) / 100));
  });
  var respBytes = num(g.avgResponseBytes, 0);
  var reqBytes = num(g.avgRequestBytes, 0);
  var userEgressBps = peakRps * respBytes;
  var originEgressBps = Math.max(0, peakRps - cdnHit) * respBytes;
  var ingressBps = peakRps * reqBytes;
  var egressMonthBytes = userEgressBps * SECONDS_PER_MONTH;
  var originEgressMonthBytes = originEgressBps * SECONDS_PER_MONTH;

  var azAvail = Math.min(1, Math.max(0, num(g.azAvailability, 99.995) / 100));
  var results = {};
  var cost = { compute: 0, storage: 0, network: 0, managed: 0 };
  var storagePerDayBytes = 0, storageNowBytes = 0;

  nodes.forEach(function (n) {
    var kind = kindOf(n);
    var p = propsOf(n);
    var l = load[n.id];
    var mode = scalingOf(n, g.autoscale);
    var cap = capacityOf(kind, p, l, rShare, mode);
    var onPath = kind !== "none" && (l > 0 || isSource[n.id]);

    // Clients emit traffic, they do not serve it, so capacity and status mean
    // nothing there and they must never be named as the bottleneck.
    var serves = kind !== "none" && kind !== "client";
    var svc = num(p.latencyMs, 0);
    var wq = serves ? queueingMs(l, svc, cap.current === undefined ? cap.total : cap.current, cap.servers) : 0;
    var util = serves ? cap.util : 0;
    var status = serves ? statusOf(util) : "none";

    var perInstance = cap.servers > 0 ? cap.total / cap.servers : 0;
    var needed = perInstance > 0 ? Math.ceil(l / perInstance) : 1;
    var avail = kind === "none" || kind === "client"
      ? 1
      : nodeAvailability(Math.min(1, num(p.availability, 100) / 100), cap.servers, p.redundancy, needed, azAvail);

    var nodeEgress = kind === "cdn" ? egressMonthBytes * (cdnSeen > 0 ? cdnHit / Math.max(cdnSeen, 1e-9) : 0)
                   : kind === "object_storage" ? originEgressMonthBytes
                   : 0;
    var c = costOf(kind, p, l, nodeEgress, cap);
    cost.compute += c.compute; cost.storage += c.storage; cost.network += c.network; cost.managed += c.managed;
    var monthly = c.compute + c.storage + c.network + c.managed;

    var perDay = 0;
    if (kind === "db_sql" || kind === "db_nosql") {
      var writes = l * (1 - rShare);
      var repl = 1 + Math.max(0, num(p.replicas, 0));
      perDay = writes * num(p.recordBytes, 0) * repl * 86400;
      storagePerDayBytes += perDay;
      storageNowBytes += num(p.storageGB, 0) * 1e9;
    }
    if (kind === "object_storage") storageNowBytes += num(p.storageGB, 0) * 1e9;

    if (onPath && serves && cap.total === 0 && l > 0) {
      warnings.push({ level: "warn", nodeId: n.id, text: (n.label || n.id) + " is taking " + Math.round(l) + " rps with no capacity set." });
    }

    var rec = {
      id: n.id, label: n.label || n.id, kind: kind, onPath: onPath, serves: serves,
      loadRps: l, capacityTotal: cap.total, utilization: util, status: status,
      binding: cap.binding, servers: cap.servers,
      scaling: mode, baseUnits: Math.max(1, num(p.count, 1)),
      units: cap.units === undefined ? cap.servers : cap.units,
      sizeMult: cap.sizeMult === undefined ? 1 : cap.sizeMult,
      atCeiling: !!cap.atCeiling,
      maxUnits: Math.max(Math.max(1, num(p.count, 1)), Math.max(1, num(p.maxScale, 1))),
      capacityNow: cap.current === undefined ? cap.total : cap.current,
      poolSize: num(p.poolSize, 0),
      source: !!isSource[n.id],
      emitsRps: isSource[n.id] && shareTotal > 0 ? peakRps * (shareOf[n.id] / shareTotal) : 0,
      shareOfTraffic: isSource[n.id] && shareTotal > 0 ? shareOf[n.id] / shareTotal : 0,
      sourceCount: sources.length,
      connCap: cap.connCapCeil || 0, connCapNow: cap.connCap || 0,
      connDemand: 0, connUtil: 0,
      storageGB: num(p.storageGB, 0), maxStorageGB: num(p.maxStorageGB, 0),
      growthBytesPerDay: 0, daysToFull: Infinity,
      serviceMs: svc, queueingMs: wq, totalMs: svc + wq,
      availability: avail, monthlyCost: monthly, costParts: c,
      reads: cap.reads, writes: cap.writes, readCap: cap.readCap, writeCap: cap.writeCap,
      drain: cap.drain, ingest: cap.ingest,
      backlogPerMin: kind === "queue" && cap.drain !== undefined && l > cap.drain ? (l - cap.drain) * 60 : 0
    };
    rec.growthBytesPerDay = perDay;
    var diskCap = num(p.maxStorageGB, 0) * 1e9;
    if (diskCap > 0 && perDay > 0) {
      rec.daysToFull = Math.max(0, (diskCap - num(p.storageGB, 0) * 1e9) / perDay);
    }
    results[n.id] = rec;
  });

  // Connections, once every node knows how large it is running. Demand comes
  // from the callers, so this has to be a second pass: a service does not know
  // its own instance count until its capacity has been worked out above.
  var soonestFull = Infinity, fullNode = null;
  edges.forEach(function (e) {
    var from = results[e.from], to = results[e.to];
    if (!from || !to || !to.connCap) return;
    if (!from.poolSize || !from.onPath) return;
    to.connDemand += from.units * from.poolSize;
  });
  nodes.forEach(function (n) {
    var r = results[n.id];
    if (!r) return;
    if (r.connCap > 0 && r.connDemand > 0) {
      r.connUtil = r.connDemand / r.connCap;
      // A connection wall counts the same as running out of throughput, and
      // it is usually the one people are surprised by.
      if (r.connUtil > r.utilization) {
        r.utilization = r.connUtil;
        r.binding = "connections";
        r.status = statusOf(r.connUtil);
      }
      if (r.connUtil > 1) {
        warnings.push({
          level: "warn", nodeId: n.id,
          text: r.label + " needs " + Math.round(r.connDemand) + " connections but offers "
                + Math.round(r.connCap) + ". Pool smaller, or put a pooler in front."
        });
      }
    }
    if (isFinite(r.daysToFull) && r.daysToFull < soonestFull) {
      soonestFull = r.daysToFull;
      fullNode = r;
    }
  });
  if (fullNode && soonestFull < 90) {
    warnings.push({
      level: "warn", nodeId: fullNode.id,
      text: fullNode.label + " fills its disk in " + Math.round(soonestFull) + " days at this write rate."
    });
  }

  // Paths, for latency and for the availability a user actually sees. Bounded
  // hard: a dense graph has exponentially many and nobody reads past the worst.
  var paths = [];
  (function () {
    var netAz = num(g.netSameAzMs, 1);
    var rtt = num(g.clientRttMs, 30);
    var tailBase = Math.max(1, num(g.tailFactor, 3));
    var walk = function (id, chain, seen, hops) {
      if (paths.length >= MAX_PATHS || chain.length > MAX_DEPTH) return;
      var next = fOut[id].filter(function (e) { return !seen.has(e.to); });
      var kind = kindOf(byId[id]);
      var terminal = !next.length || KINDS[kind].pass === "sink";
      if (terminal) {
        var p50 = 0, p99 = 0;
        chain.forEach(function (nid, i) {
          var r = results[nid];
          if (!r) return;
          var per = r.totalMs;
          var u = isFinite(r.utilization) ? Math.min(r.utilization, 1) : 1;
          p50 += per;
          p99 += per * (tailBase * (1 + 2 * u * u));
          var hop = i === 0 ? rtt : netAz;
          p50 += hop; p99 += hop;
        });
        paths.push({ nodes: chain.slice(), p50: p50, p99: p99 });
        return;
      }
      next.forEach(function (e) {
        seen.add(e.to);
        chain.push(e.to);
        walk(e.to, chain, seen, hops + 1);
        chain.pop();
        seen.delete(e.to);
      });
    };
    sources.forEach(function (s) {
      var seen = new Set([s.id]);
      walk(s.id, [s.id], seen, 0);
    });
  })();

  paths.sort(function (a, b) { return b.p99 - a.p99; });
  var critical = paths[0] || null;
  if (paths.length >= MAX_PATHS) {
    warnings.push({ level: "info", text: "More than " + MAX_PATHS + " client paths exist. Latency reports the worst ones found." });
  }

  // What a user sees: every node on the slowest path has to be up.
  var systemAvail = 1;
  if (critical) critical.nodes.forEach(function (id) { systemAvail *= results[id] ? results[id].availability : 1; });

  var bottleneck = null;
  var headroom = Infinity;
  nodes.forEach(function (n) {
    var r = results[n.id];
    if (!r || !r.onPath || !r.serves || r.loadRps <= 0) return;
    if (!bottleneck || r.utilization > bottleneck.utilization) bottleneck = r;
    if (r.capacityTotal > 0) headroom = Math.min(headroom, r.capacityTotal / r.loadRps);
    else headroom = 0;
  });

  var totalCost = cost.compute + cost.storage + cost.network + cost.managed;
  var reqMonth = peakRps * SECONDS_PER_MONTH;

  return {
    globals: g,
    nodes: results,
    edgeRps: edgeRps,
    paths: paths,
    critical: critical,
    warnings: warnings,
    backEdges: back,
    system: {
      peakRps: peakRps,
      baseRps: peakRps / Math.max(1, num(g.peakMultiplier, 1)),
      readShare: rShare,
      bottleneck: bottleneck,
      headroom: headroom,
      availability: systemAvail,
      downtimeMinutesPerYear: (1 - systemAvail) * MINUTES_PER_YEAR,
      p50: critical ? critical.p50 : 0,
      p99: critical ? critical.p99 : 0,
      cost: cost,
      totalCost: totalCost,
      costPer1kRequests: reqMonth > 0 ? (totalCost / reqMonth) * 1000 : 0,
      costPerDauMonth: num(g.dau, 0) > 0 ? totalCost / num(g.dau, 0) : 0,
      ingressBps: ingressBps,
      egressBps: userEgressBps,
      originEgressBps: originEgressBps,
      egressMonthBytes: egressMonthBytes,
      storageNowBytes: storageNowBytes,
      storagePerDayBytes: storagePerDayBytes,
      storagePerYearBytes: storagePerDayBytes * 365,
      storageAtRetentionBytes: storageNowBytes + storagePerDayBytes * num(g.retentionDays, 365),
      daysToFull: soonestFull,
      fillsFirst: fullNode
    }
  };
}
