# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# ---- Runtime stage ----
FROM eclipse-temurin:17-jre AS runtime
WORKDIR /app

# Pulls the latest agent for convenience. For reproducible production images, pin a
# release instead, e.g.:
#   ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.11.0/opentelemetry-javaagent.jar /app/opentelemetry-javaagent.jar
ADD https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar /app/opentelemetry-javaagent.jar

COPY --from=build /workspace/target/springboot-otel-sample.jar /app/app.jar

# Defaults assume the container runs on the deploy/simple Docker network and reaches the
# collector by service name over gRPC. Override per environment.
ENV OTEL_SERVICE_NAME=springboot-otel-sample \
    OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317 \
    OTEL_EXPORTER_OTLP_PROTOCOL=grpc \
    OTEL_RESOURCE_ATTRIBUTES=service.namespace=quasar-tracing,service.version=1.0.0,deployment.environment.name=local \
    OTEL_TRACES_SAMPLER=parentbased_always_on \
    OTEL_INSTRUMENTATION_MICROMETER_ENABLED=true

EXPOSE 8090
ENTRYPOINT ["java", "-javaagent:/app/opentelemetry-javaagent.jar", "-jar", "/app/app.jar"]
