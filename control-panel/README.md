# Quasar Tracing · Control Panel

The web frontend for the Quasar Tracing observability platform — overview, trace search,
trace waterfalls, service dependency map, log search and RED metrics.

The app is wired to the real platform API. Vite proxies `/api/*` to the
Spring Boot backend on `http://127.0.0.1:8080`.

## Stack

React 18 · Vite 5 · Ant Design 5 · ECharts 5 · Axios · React Router 6 · i18next

Theme: clean, Swiss-minimal, **white + orange**. Fonts: IBM Plex Sans (UI) +
JetBrains Mono (ids / logs / numbers).

## Quick start

```bash
# from the repository root
npm install --prefix control-panel
npm run dev --prefix control-panel      # → http://localhost:5173
```

Start the middleware stack and platform API first when using live data:

```bash
cd deploy/simple
docker compose up -d

cd ../../platform
mvn -pl quasar-tracing-server -am spring-boot:run
```

```bash
npm run build   --prefix control-panel  # production build → control-panel/dist/
npm run preview --prefix control-panel  # serve the production build
```

## Pages

| Route | Page | Highlights |
|---|---|---|
| `/` | **Overview** | KPIs, request/error trends, top endpoints, service health, recent errors |
| `/traces` | **Trace Search** | Filter by service / operation / status / duration; sortable results |
| `/traces/:id` | **Trace Detail** | Interactive span **waterfall**, span drawer, `trace_id`-correlated logs |
| `/services` | **Service Map** | Force-directed dependency graph; click a node for RED metrics & deps |
| `/logs` | **Log Search** | Severity histogram, faceted search, log → trace pivot |
| `/metrics` | **Metrics** | Per-service RED: throughput, error rate, latency p50/p90/p99, endpoints |

## Interactive workflows to try

- **Search → drill down:** top-bar search or `/traces` → open a trace → inspect the
  waterfall → click a span → switch to **Related logs**.
- **Logs ↔ traces:** in Log Search, open a log → **View trace**; from a trace, jump to
  the correlated logs.
- **Health → topology:** Overview → click a service row → it opens focused in the
  **Service Map** → open **Metrics** for that service.
- **Time range:** the top-bar selector (15m–24h) re-scopes Overview, Service Map and
  Metrics live.

## Data access

All page data goes through `src/api`. The wrappers unwrap the backend
`QTResponse{code,message,data}` envelope, flatten paged `QTPageDTO` payloads from
`{current,size,total,records}` to `{total,items}`, and revive string-encoded `Long`
fields back to numbers for the UI.

## Structure

```
src/
├── theme/        design tokens + Ant Design theme (white/orange)
├── styles/       global CSS variables and shared utility classes
├── i18n/         English + Simplified Chinese locale setup
├── api/          axios client + endpoint wrappers
├── context/      global time range + environment state
├── hooks/        shared data-fetching hook
├── utils/        formatting and service-color helpers
├── charts/       ECharts option builders
├── components/   reusable building blocks (EChart, tags, waterfall, drawers, ...)
├── layouts/      app shell (sidebar + top bar)
├── router/       navigation model
└── pages/        one folder per page
```
