/**
 * Deterministic color assignment so a service always renders in the same hue
 * across the waterfall, service map, tables and charts.
 *
 * @author Quasar
 */
import { chartPalette } from '@/theme/tokens';

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return Math.abs(hash);
}

/** Stable categorical color for a service name. */
export function serviceColor(serviceName, palette = chartPalette) {
  if (!serviceName) return palette[palette.length - 1];
  return palette[hashString(serviceName) % palette.length];
}

/** Build a { service: color } map for legends. */
export function serviceColorMap(services = []) {
  return services.reduce((acc, svc) => {
    acc[svc] = serviceColor(svc);
    return acc;
  }, {});
}
