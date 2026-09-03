// The capacity model behind every diagram node.
//
// A node's `kind` decides which numbers it carries and how traffic passes
// through it. Kind is inferred from the icon the user already picked, so an
// imported diagram computes without anyone filling in a form first. Overrides
// land in `node.props`; everything else falls back here, which means improving
// a default improves every diagram already saved.

export const REDUNDANCY = ["none", "active-passive", "active-active", "multi-az"];

// What a node does when load rises. "fixed" is a wall, "horizontal" adds
// instances, "vertical" makes one bigger and runs out sooner. Only consulted
// when autoscaling is switched on globally.
export const SCALING = ["fixed", "horizontal", "vertical"];

// Shared by most kinds. Order is the order they render in the panel.
const BASE = ["count", "capacityRps", "latencyMs", "availability", "costPerHour", "redundancy"];

// Appended to any kind that can scale, so the three knobs always sit together.
const SCALE_FIELDS = ["scaling", "maxScale", "targetUtil"];

export const FIELDS = {
  count:        { label: "Instances",    unit: "",     min: 1, max: 100000, step: 1,     hint: "How many run in parallel" },
  // A weight, not a percentage. Naming it "share" invited people to type 20
  // and expect a fifth of the traffic, so it says weight and the panel prints
  // the percentage it works out to.
  share:        { label: "Traffic weight", unit: "", min: 0, max: 100000, step: 1,
                  hint: "Relative to the other entry points. Two clients at 3 and 1 split the traffic 75/25. Zero mutes this one" },
  capacityRps:  { label: "Capacity",     unit: "rps",  min: 0, max: 1e9,    step: 1,     hint: "Requests per second one instance handles" },
  latencyMs:    { label: "Service time", unit: "ms",   min: 0, max: 600000, step: 0.1,   hint: "p50 time to handle one request, before any waiting" },
  availability: { label: "Availability", unit: "%",    min: 0, max: 100,    step: 0.001, hint: "Uptime of a single instance" },
  costPerHour:  { label: "Cost",         unit: "$/hr", min: 0, max: 1e6,    step: 0.001, hint: "Per instance, per hour" },
  redundancy:   { label: "Redundancy",   unit: "",     options: REDUNDANCY, hint: "How instance failures are absorbed" },

  scaling:      { label: "Scaling",      unit: "",     options: SCALING, hint: "What this does when load rises, once autoscaling is on" },
  maxScale:     { label: "Scale limit",  unit: "",     min: 1, max: 100000, step: 1, hint: "Most instances it may reach, or biggest size for vertical" },
  targetUtil:   { label: "Scale target", unit: "%",    min: 1, max: 100, step: 1, hint: "Utilization the autoscaler aims to hold" },

  // Connections are demanded by whoever calls, and supplied by whoever is
  // called. They are the one constraint that gets worse as the caller scales.
  poolSize:     { label: "Pool per instance", unit: "conns", min: 0, max: 100000, step: 1,
                  hint: "Connections each instance holds open to each datastore it calls" },
  maxConnections: { label: "Max connections", unit: "", min: 0, max: 1000000, step: 1,
                  hint: "Per instance. 0 means no limit worth modelling" },
  maxStorageGB: { label: "Disk capacity", unit: "GB", min: 0, max: 1e9, step: 1,
                  hint: "0 means it grows without a ceiling" },

  hitRate:         { label: "Hit rate",  unit: "%",    min: 0, max: 100,    step: 0.1,   hint: "Share answered here, the rest flows downstream" },
  egressCostPerGB: { label: "Egress",    unit: "$/GB", min: 0, max: 100,    step: 0.001, hint: "Charged on data leaving to the internet" },
  memoryGB:     { label: "Memory",       unit: "GB",   min: 0, max: 1e6,    step: 1,     hint: "Per instance" },
  cpuBoundMs:   { label: "CPU time",     unit: "ms",   min: 0, max: 600000, step: 0.1,   hint: "Part of service time that burns CPU" },
  ioBoundMs:    { label: "I/O wait",     unit: "ms",   min: 0, max: 600000, step: 0.1,   hint: "Part of service time spent waiting on something else" },

  readCapacityRps:  { label: "Read capacity",  unit: "rps", min: 0, max: 1e9, step: 1, hint: "Per instance, per shard" },
  writeCapacityRps: { label: "Write capacity", unit: "rps", min: 0, max: 1e9, step: 1, hint: "Per instance, per shard" },
  storageGB:    { label: "Storage",      unit: "GB",   min: 0, max: 1e9,  step: 1, hint: "Data held today" },
  replicas:     { label: "Replicas",     unit: "",     min: 0, max: 100,  step: 1, hint: "Extra copies kept for reads and durability" },
  shards:       { label: "Shards",       unit: "",     min: 1, max: 100000, step: 1, hint: "Traffic and data split this many ways" },
  recordBytes:  { label: "Record size",  unit: "bytes",min: 0, max: 1e9,  step: 1, hint: "Average row written" },

  consumerCount:{ label: "Consumers",    unit: "",     min: 0, max: 100000, step: 1, hint: "Workers draining the queue" },
  consumerRps:  { label: "Drain rate",   unit: "rps",  min: 0, max: 1e9,  step: 1, hint: "Messages one consumer clears per second" },
  maxDepth:     { label: "Max depth",    unit: "msgs", min: 0, max: 1e12, step: 1, hint: "0 means unbounded" },

  costPerGBMonth: { label: "Storage cost", unit: "$/GB/mo", min: 0, max: 100, step: 0.001, hint: "Charged monthly on data at rest" },
  indexGB:      { label: "Index size",   unit: "GB",   min: 0, max: 1e9,  step: 1, hint: "Searchable data held" },
  rateLimitRps: { label: "Rate limit",   unit: "rps",  min: 0, max: 1e9,  step: 1, hint: "Ceiling the provider enforces" },
  costPerCall:  { label: "Cost per call",unit: "$",    min: 0, max: 1000, step: 0.00001, hint: "Charged per request" }
};

// `pass` is what happens to a request that arrives:
//   all    it continues downstream
//   miss   only the share that missed continues
//   sink   it is answered here and the path ends
//   async  it leaves the request path, handled later
//   none   off the traffic path entirely
export const KINDS = {
  client: {
    // Traffic starts here. There is nothing to size, so the only thing worth
    // setting is how much of the total this entry point accounts for.
    label: "Client", pass: "all", source: true,
    fields: ["share"],
    defaults: { share: 1, count: 1, capacityRps: 0, latencyMs: 0, availability: 100, costPerHour: 0, redundancy: "none" }
  },
  cdn: {
    label: "CDN / edge", pass: "miss",
    fields: ["hitRate", "latencyMs", "availability", "egressCostPerGB"],
    defaults: { count: 1, capacityRps: 1e7, latencyMs: 12, availability: 99.99, costPerHour: 0, redundancy: "multi-az", hitRate: 85, egressCostPerGB: 0.02 }
  },
  lb: {
    label: "Load balancer", pass: "all", scales: "horizontal",
    fields: BASE.concat(SCALE_FIELDS),
    defaults: { count: 2, capacityRps: 100000, latencyMs: 1, availability: 99.99, costPerHour: 0.03, redundancy: "multi-az" , maxScale: 20, targetUtil: 70}
  },
  service: {
    label: "Service", pass: "all", scales: "horizontal",
    fields: ["count", "capacityRps", "cpuBoundMs", "ioBoundMs", "availability", "costPerHour", "poolSize", "redundancy"].concat(SCALE_FIELDS),
    defaults: { count: 4, capacityRps: 400, latencyMs: 25, availability: 99.9, costPerHour: 0.19, redundancy: "multi-az", cpuBoundMs: 8, ioBoundMs: 17 , maxScale: 50, targetUtil: 70, poolSize: 20}
  },
  cache: {
    label: "Cache", pass: "miss", scales: "horizontal",
    fields: ["hitRate", "count", "capacityRps", "latencyMs", "memoryGB", "availability", "costPerHour", "redundancy"].concat(SCALE_FIELDS),
    defaults: { count: 3, capacityRps: 100000, latencyMs: 1, availability: 99.9, costPerHour: 0.15, redundancy: "active-active", hitRate: 80, memoryGB: 26 , maxScale: 20, targetUtil: 70}
  },
  db_sql: {
    label: "SQL database", pass: "sink", scales: "vertical",
    fields: ["readCapacityRps", "writeCapacityRps", "shards", "replicas", "storageGB", "maxStorageGB", "maxConnections", "recordBytes", "latencyMs", "availability", "costPerHour", "redundancy"].concat(SCALE_FIELDS),
    defaults: { count: 1, capacityRps: 0, latencyMs: 8, availability: 99.95, costPerHour: 0.68, redundancy: "multi-az",
                readCapacityRps: 12000, writeCapacityRps: 3000, storageGB: 500, replicas: 2, shards: 1, recordBytes: 512 , maxScale: 8, targetUtil: 70, maxStorageGB: 2000, maxConnections: 200}
  },
  db_nosql: {
    label: "NoSQL database", pass: "sink", scales: "vertical",
    fields: ["readCapacityRps", "writeCapacityRps", "shards", "replicas", "storageGB", "maxStorageGB", "maxConnections", "recordBytes", "latencyMs", "availability", "costPerHour", "redundancy"].concat(SCALE_FIELDS),
    defaults: { count: 1, capacityRps: 0, latencyMs: 5, availability: 99.99, costPerHour: 0.42, redundancy: "multi-az",
                readCapacityRps: 40000, writeCapacityRps: 20000, storageGB: 1000, replicas: 3, shards: 4, recordBytes: 512 , maxScale: 8, targetUtil: 70, maxStorageGB: 8000, maxConnections: 2000}
  },
  queue: {
    label: "Queue / bus", pass: "async", scales: "horizontal",
    fields: ["capacityRps", "consumerCount", "consumerRps", "maxDepth", "latencyMs", "availability", "costPerHour", "redundancy"].concat(SCALE_FIELDS),
    defaults: { count: 3, capacityRps: 200000, latencyMs: 2, availability: 99.95, costPerHour: 0.12, redundancy: "multi-az",
                consumerCount: 4, consumerRps: 500, maxDepth: 0 , maxScale: 50, targetUtil: 70}
  },
  worker: {
    label: "Worker", pass: "all", scales: "horizontal",
    fields: BASE.concat(["poolSize"], SCALE_FIELDS),
    defaults: { count: 4, capacityRps: 200, latencyMs: 120, availability: 99.5, costPerHour: 0.19, redundancy: "active-active" , maxScale: 50, targetUtil: 70, poolSize: 10}
  },
  object_storage: {
    label: "Object storage", pass: "sink",
    fields: ["storageGB", "maxStorageGB", "capacityRps", "latencyMs", "availability", "costPerGBMonth", "egressCostPerGB"],
    defaults: { count: 1, capacityRps: 55000, latencyMs: 35, availability: 99.99, costPerHour: 0, redundancy: "multi-az",
                storageGB: 2000, costPerGBMonth: 0.023, egressCostPerGB: 0.09 , maxStorageGB: 0}
  },
  search: {
    label: "Search index", pass: "sink", scales: "horizontal",
    fields: ["count", "capacityRps", "indexGB", "latencyMs", "availability", "costPerHour", "redundancy"].concat(SCALE_FIELDS),
    defaults: { count: 3, capacityRps: 1200, latencyMs: 40, availability: 99.9, costPerHour: 0.34, redundancy: "active-active", indexGB: 200 , maxScale: 20, targetUtil: 70}
  },
  external_api: {
    label: "External API", pass: "sink",
    fields: ["rateLimitRps", "latencyMs", "availability", "costPerCall"],
    defaults: { count: 1, capacityRps: 0, latencyMs: 180, availability: 99.5, costPerHour: 0, redundancy: "none",
                rateLimitRps: 500, costPerCall: 0.0004 }
  },
  security: {
    label: "Policy / security", pass: "all", scales: "horizontal",
    fields: BASE.concat(["poolSize"], SCALE_FIELDS),
    defaults: { count: 2, capacityRps: 50000, latencyMs: 2, availability: 99.95, costPerHour: 0.05, redundancy: "multi-az" , maxScale: 20, targetUtil: 70, poolSize: 5}
  },
  none: {
    label: "Not on the traffic path", pass: "none",
    fields: [],
    defaults: { count: 1, capacityRps: 0, latencyMs: 0, availability: 100, costPerHour: 0, redundancy: "none" }
  }
};

export const KIND_KEYS = Object.keys(KINDS);

// Which kind an icon implies. Anything unlisted falls through to "service",
// the safe guess for a box drawn without an icon.
const BY_ICON = {
  user: "client", mobile: "client", desktop: "client", sensor: "client", external: "client",
  cloud: "cdn", internetgateway: "cdn",
  loadbalancer: "lb", proxy: "lb", gateway: "lb", natgateway: "lb", dns: "lb", vpn: "lb",
  server: "service", vm: "service", function: "service", aiagent: "service",
  worker: "worker", scheduler: "worker", stream: "worker",
  cache: "cache",
  db: "db_sql", replica: "db_sql",
  queue: "queue", eventbus: "queue",
  bucket: "object_storage",
  search: "search", warehouse: "search",
  firewall: "security", waf: "security", auth: "security", ratelimiter: "security", secrets: "security",
  registry: "none", observability: "none"
};

// What the palette offers, and the kind each entry means. The sidebar used to
// place a decorative icon and let kindOf guess the behaviour from it, which
// meant restyling a node silently changed its capacity. Now the palette picks
// the kind and the icon comes along for the ride.
export const PALETTE_KIND = {
  user: "client", external: "client", mobile: "client", desktop: "client", sensor: "client",
  auth: "security", firewall: "security", waf: "security", secrets: "security", ratelimiter: "security",
  server: "service", vm: "service", function: "service", aiagent: "service",
  worker: "worker", scheduler: "worker", stream: "worker",
  db: "db_sql", replica: "db_sql", cache: "cache",
  bucket: "object_storage", search: "search", warehouse: "search",
  cloud: "cdn", internetgateway: "cdn",
  dns: "lb", loadbalancer: "lb", gateway: "lb", proxy: "lb", natgateway: "lb", vpn: "lb",
  queue: "queue", eventbus: "queue",
  registry: "none", observability: "none"
};

export function kindOf(node) {
  if (!node) return "none";
  if (node.kind && KINDS[node.kind]) return node.kind;
  if (node.type === "container" || node.shape === "text") return "none";
  // A diamond is a routing decision, not a component that does work.
  if (node.shape === "diamond") return "none";
  return BY_ICON[node.icon] || "service";
}

// One node's numbers: kind defaults with the user's overrides on top.
export function propsOf(node) {
  var kind = kindOf(node);
  var out = Object.assign({}, KINDS[kind].defaults);
  var own = node && node.props;
  if (own) {
    Object.keys(own).forEach(function (k) {
      if (own[k] !== null && own[k] !== undefined && own[k] !== "") out[k] = own[k];
    });
  }
  return out;
}

// The scaling mode in force: what the user picked, else the kind default,
// and "fixed" for everything when autoscaling is switched off globally.
export function scalingOf(node, autoscaleOn) {
  if (!autoscaleOn) return "fixed";
  var own = node && node.props && node.props.scaling;
  if (own && SCALING.indexOf(own) !== -1) return own;
  return KINDS[kindOf(node)].scales || "fixed";
}

export function fieldsOf(node) {
  return KINDS[kindOf(node)].fields;
}
