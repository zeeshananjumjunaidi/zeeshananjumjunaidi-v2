// Shared formatting/DOM helpers used by every calculator tab module.

export function n(v) {
  var x = parseFloat(v);
  return isFinite(x) ? x : 0;
}

export function fmt(x, d) {
  d = d === undefined ? 2 : d;
  if (!isFinite(x)) return "—";
  var a = Math.abs(x);
  if (a === 0) return "0";
  if (a >= 1e15) return x.toExponential(2);
  if (a >= 1e12) return (x / 1e12).toFixed(d) + "T";
  if (a >= 1e9) return (x / 1e9).toFixed(d) + "B";
  if (a >= 1e6) return (x / 1e6).toFixed(d) + "M";
  if (a >= 1e3) return (x / 1e3).toFixed(d) + "K";
  if (a >= 100) return x.toFixed(0);
  if (a >= 1) return x.toFixed(d);
  if (a >= 0.001) return x.toFixed(4);
  return x.toExponential(2);
}

export function int(x) {
  if (!isFinite(x)) return "—";
  return Math.round(x).toLocaleString("en-US");
}

// Short word form for a preview line under raw number inputs, e.g. "10M" --
// native number inputs can't render "10,000,000" with separators themselves.
export function short(x) {
  var a = Math.abs(x);
  var units = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (var i = 0; i < units.length; i++) {
    if (a >= units[i][0]) {
      var r = Math.round((x / units[i][0]) * 10) / 10;
      return (r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)) + units[i][1];
    }
  }
  return int(x);
}

export function numPreview(x) {
  if (!isFinite(x) || Math.abs(x) < 1000) return "";
  return int(x) + " (" + short(x) + ")";
}

var BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
export function bytes(b) {
  if (!isFinite(b) || b === 0) return "0 B";
  var i = 0;
  var x = Math.abs(b);
  while (x >= 1024 && i < BYTE_UNITS.length - 1) {
    x /= 1024;
    i++;
  }
  return (x >= 100 ? x.toFixed(0) : x.toFixed(2)) + " " + BYTE_UNITS[i];
}

// Network bandwidth is quoted in bits, decimal (powers of 1000) by convention --
// unlike storage, which is bytes, binary (powers of 1024) via bytes() above.
var BIT_UNITS = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
export function bitrate(bps) {
  if (!isFinite(bps) || bps === 0) return "0 bps";
  var i = 0;
  var x = Math.abs(bps);
  while (x >= 1000 && i < BIT_UNITS.length - 1) {
    x /= 1000;
    i++;
  }
  return (x >= 100 ? x.toFixed(0) : x.toFixed(2)) + " " + BIT_UNITS[i];
}

export function dur(s) {
  if (!isFinite(s)) return "—";
  if (s < 1e-3) return (s * 1e6).toFixed(1) + " µs";
  if (s < 1) return (s * 1e3).toFixed(1) + " ms";
  if (s < 90) return s.toFixed(1) + " s";
  if (s < 5400) return (s / 60).toFixed(1) + " min";
  if (s < 172800) return (s / 3600).toFixed(1) + " h";
  if (s < 63113852) return (s / 86400).toFixed(1) + " d";
  return (s / 31556952).toFixed(1) + " y";
}

export function toggle(id, on) {
  var el = document.getElementById(id);
  el.classList.toggle("on", on);
}

export function setTone(id, tone) {
  var el = document.getElementById(id);
  el.classList.toggle("tone-bad", tone === "bad");
  el.classList.toggle("tone-ok", tone === "ok");
}
