# Quasar Tracing Helm Deployment

This chart is the only supported Kubernetes deployment path for Quasar Tracing.

## Files

```text
deploy/helm/quasar-tracing/
├── Chart.yaml
├── values.example.yaml   # public template
├── values.yaml           # local ignored deployment values
├── files/sql/            # ClickHouse DDL bundled into the chart
└── templates/            # Kafka, ClickHouse, OTel, platform API, and control panel
```

## Prepare Local Values

Copy the public template and replace environment-specific values:

```bash
cp deploy/helm/quasar-tracing/values.example.yaml deploy/helm/quasar-tracing/values.yaml
```

At minimum, review:

- `registry.host`, `registry.project`, and image repositories.
- `clickhouse.credentials.user` and `clickhouse.credentials.password`.
- `clickhouse.storage.hostPath` and `kafka.storage.hostPath` for single-node deployments.
- `controlPanel.ingress.host` and service exposure settings.
- `instrumentation.targetNamespace` and collector endpoints.

`values.yaml` is ignored by Git because it belongs to a specific deployment environment.

## Render

```bash
helm template quasar-tracing deploy/helm/quasar-tracing \
  --namespace quasar-tracing \
  --values deploy/helm/quasar-tracing/values.yaml
```

## Install Or Upgrade

```bash
helm upgrade --install quasar-tracing deploy/helm/quasar-tracing \
  --namespace quasar-tracing \
  --create-namespace \
  --values deploy/helm/quasar-tracing/values.yaml
```

## Java Agent Environment

After installation, `helm status quasar-tracing -n quasar-tracing` prints recommended
OpenTelemetry Java Agent environment variables for application workloads.
