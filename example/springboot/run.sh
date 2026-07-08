#!/usr/bin/env bash
# Build and run the sample on the host, exporting OTLP to the local collector over HTTP.
# The middleware stack (deploy/simple) and its Kafka topics must already be up.
set -euo pipefail
cd "$(dirname "$0")"

AGENT="opentelemetry-javaagent.jar"
if [ ! -f "$AGENT" ]; then
  echo "Downloading the OpenTelemetry Java Agent (latest)..."
  curl -sSfL -o "$AGENT" \
    https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar
fi

mvn -q -DskipTests package

exec java \
  -javaagent:"$PWD/$AGENT" \
  -Dotel.service.name=springboot-otel-sample \
  -Dotel.resource.attributes=service.namespace=quasar-tracing,service.version=1.0.0,deployment.environment.name=local \
  -Dotel.exporter.otlp.endpoint=http://localhost:4318 \
  -Dotel.exporter.otlp.protocol=http/protobuf \
  -Dotel.traces.sampler=parentbased_always_on \
  -Dotel.instrumentation.micrometer.enabled=true \
  -jar target/springboot-otel-sample.jar
