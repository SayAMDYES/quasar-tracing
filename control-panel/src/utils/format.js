/**
 * Formatting helpers for durations, timestamps and numbers.
 * Telemetry durations are nanoseconds (matching the ClickHouse `Duration` /
 * `duration_ns` columns); timestamps are JS epoch milliseconds.
 *
 * @author Quasar
 */
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';

dayjs.extend(relativeTime);

/** Nanoseconds → milliseconds (number). */
export function nsToMs(ns) {
  return ns / 1e6;
}

/** Human-readable duration from nanoseconds, e.g. 1230000 → "1.23ms". */
export function formatDuration(ns) {
  if (ns == null) return '—';
  if (typeof ns === 'bigint' || (typeof ns === 'string' && /^\d+$/.test(ns))) {
    const value = BigInt(ns);
    const fixed = (divisor, digits) => {
      const scale = 10n ** BigInt(digits);
      const rounded = (value * scale + divisor / 2n) / divisor;
      const whole = rounded / scale;
      if (digits === 0) return whole.toString();
      const fraction = (rounded % scale).toString().padStart(digits, '0');
      return `${whole}.${fraction}`;
    };
    if (value < 1_000n) return `${value}ns`;
    if (value < 1_000_000n) return `${fixed(1_000n, value < 10_000n ? 2 : 1)}µs`;
    if (value < 1_000_000_000n) {
      const digits = value < 10_000_000n ? 2 : value < 100_000_000n ? 1 : 0;
      return `${fixed(1_000_000n, digits)}ms`;
    }
    return `${fixed(1_000_000_000n, 2)}s`;
  }
  if (ns < 1_000) return `${ns}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(ns < 10_000 ? 2 : 1)}µs`;
  if (ns < 1_000_000_000) {
    const ms = ns / 1_000_000;
    return `${ms.toFixed(ms < 10 ? 2 : ms < 100 ? 1 : 0)}ms`;
  }
  return `${(ns / 1_000_000_000).toFixed(2)}s`;
}

/** Human-readable duration from milliseconds. */
export function formatMs(ms) {
  return formatDuration(ms * 1e6);
}

/** Full timestamp with millisecond precision. */
export function formatTimestamp(value) {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss.SSS');
}

/** Time-of-day with milliseconds — used in dense log/trace tables. */
export function formatTime(value) {
  return dayjs(value).format('HH:mm:ss.SSS');
}

/** Relative time, e.g. "12s ago". */
export function fromNow(value) {
  return dayjs(value).fromNow();
}

/** Compact number formatting, e.g. 12345 → "12.3k". */
export function formatNumber(n) {
  if (n == null) return '—';
  if (Math.abs(n) < 1_000) return Number.isInteger(n) ? `${n}` : n.toFixed(1);
  if (Math.abs(n) < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  if (Math.abs(n) < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(1)}B`;
}

/** Thousands-separated integer. */
export function formatInt(n) {
  return n == null ? '—' : Math.round(n).toLocaleString('en-US');
}

/** Percentage with a fixed number of decimals. */
export function formatPercent(ratio, digits = 2) {
  if (ratio == null || Number.isNaN(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Throughput formatted per second. */
export function formatRate(perSecond, unit = 'req/s') {
  if (perSecond == null) return '—';
  const v = perSecond < 10 ? perSecond.toFixed(2) : formatNumber(perSecond);
  return `${v} ${unit}`;
}

/** Shorten an id (trace/span) for dense display, keeping it recognisable. */
export function shortId(id, head = 8) {
  if (!id) return '—';
  return id.length <= head ? id : `${id.slice(0, head)}…`;
}
