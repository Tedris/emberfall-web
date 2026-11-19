// src/format.ts
// Pure number formatter: exact under 10K (comma groups), suffix ladder from
// 10K, scientific past the top suffix. A value that would render "1000<suffix>"
// climbs one tier so it never shows.

import Config from "./config";

function trimTail(s: string): string {
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

export const Format = {
  commas(intStr: string): string {
    return intStr.replace(/\B(?=(\d{3})+$)/g, ",");
  },

  number(num: unknown): string {
    if (typeof num !== "number" || !Number.isFinite(num) || num <= 0) {
      return num === Infinity ? "∞" : "0";
    }
    const n = Math.floor(num);
    if (n < 1000) return String(n);
    if (n < 10000) return Format.commas(String(n));

    const suffixes = Config.NUMBER_SUFFIXES;
    for (let i = 0; i < suffixes.length; i++) {
      const scale = Math.pow(10, 3 * (i + 1));
      if (n < scale * 1000) {
        const v = n / scale;
        if (v >= 999.995 && i < suffixes.length - 1) {
          return trimTail((n / (scale * 1000)).toFixed(2)) + suffixes[i + 1];
        }
        return trimTail(v.toFixed(2)) + suffixes[i];
      }
    }
    // Past the ladder (doubles cap ≈ zone 3.5k; document in README).
    const e = Math.floor(Math.log10(n));
    return (n / Math.pow(10, e)).toFixed(2) + "e" + e;
  },

  clock(sec: unknown): string {
    if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "0:00:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  },
};

export default Format;
