// The last computed model and the last load-test run, parked where the
// exporter can reach them. The studio owns the numbers and writes here; the
// export dialog reads. A shared module rather than a direct import, so neither
// side has to know the other exists.

var state = {
  result: null,      // most recent computeGraph output
  globals: null,     // the dials it was computed at
  scenario: null,    // { key, label, seconds } of the last run
  samples: [],       // one entry per animation frame of that run
  events: [],        // what changed status, and at what traffic
  note: ""           // the one-line verdict of the run, if it has one
};

export function setModel(result, globals) {
  state.result = result;
  state.globals = globals;
}

export function setRun(scenario, samples, events, note) {
  state.scenario = scenario;
  state.samples = samples || [];
  state.events = events || [];
  state.note = note || "";
}

export function clearRun() {
  state.scenario = null;
  state.samples = [];
  state.events = [];
  state.note = "";
}

export function getState() {
  return state;
}

export function hasRun() {
  return !!(state.scenario && state.samples.length > 1);
}
