# Chart Loading Animation Design

## Goal

Give every ECharts visualization a visible, polished entrance instead of rendering at its final state immediately. Animation should help users understand how data is constructed without delaying dashboard use.

## Scope

The change covers all charts rendered through `control-panel/src/components/EChart.jsx`:

- Throughput and error-rate area lines
- Latency percentile lines
- Endpoint horizontal bars
- Log severity stacked bars
- KPI spark lines
- Service dependency graph

Page layout, API requests, loading masks, tables and non-chart components are unchanged.

## Motion Direction

Use a pronounced monitoring-dashboard motion style:

- Initial chart entrance lasts approximately 800–1100 ms.
- The chart container fades in with a small upward movement.
- Lines draw from left to right.
- Bar data grows from its value-axis origin with a short per-item stagger.
- Stacked severity bars reveal by time bucket.
- Service-map nodes and edges appear progressively while the force layout settles.
- Motion uses decelerating easing and avoids bounce effects.

The animation must remain functional rather than decorative. Axes and labels stay stable while data marks animate, so the dashboard remains easy to scan.

## Architecture

### Shared EChart Wrapper

`EChart.jsx` owns common motion behavior:

- Detect the user's `prefers-reduced-motion` setting.
- Apply shared initial and update animation defaults before `setOption`.
- Track whether the chart is receiving its first option or an update.
- Add a container entrance class only for the first render.
- Disable all chart and container animation when reduced motion is requested.

### Chart Option Builders

`charts/options.js` provides chart-specific timing:

- Line charts use a longer drawing duration.
- Horizontal and stacked bars use index-based delays.
- The service graph uses node-based delays and a shorter update transition.
- KPI spark lines use a shorter duration because several render simultaneously.

Option builders only describe chart-specific behavior; lifecycle and accessibility stay in the shared wrapper.

## Refresh Behavior

- Initial page load: play the full entrance animation.
- Manual refresh: keep the existing chart mounted and use a visible update transition of approximately 500 ms.
- Automatic refresh: update values smoothly without replaying the container entrance or item stagger.
- Navigation back to a page: treat newly mounted charts as an initial entrance.

The existing silent auto-refresh loading behavior remains unchanged.

## Reduced Motion

When `prefers-reduced-motion: reduce` is active:

- Set ECharts `animation` to `false`.
- Do not apply opacity or transform transitions to the chart container.
- Render the final chart state immediately.

## Failure And Empty States

- Animation starts only after a non-null chart option is available.
- Existing loading, error and empty-state components continue to own those states.
- Resize events must not replay entrance animations.
- Repeated option updates must not accumulate event handlers or timers.

## Verification

Verify the following without publishing:

1. Production frontend build succeeds.
2. Every chart type animates on first display.
3. Manual refresh uses an update transition.
4. Automatic refresh does not replay entrance animation or show a loading mask.
5. Service-map selection updates do not restart the full graph entrance.
6. Reduced-motion mode renders charts without animation.
7. Desktop and narrow viewport layouts show no clipping or chart-container movement.
