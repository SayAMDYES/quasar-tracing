# Build and run the sample on the host, exporting OTLP to the local collector over HTTP.
# The middleware stack (deploy/simple) and its Kafka topics must already be up.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$agentVersion = '2.11.0'
$agent = 'opentelemetry-javaagent.jar'
if (-not (Test-Path $agent)) {
    Write-Host "Downloading the OpenTelemetry Java Agent ($agentVersion)..."
    Invoke-WebRequest `
        -Uri "https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v$agentVersion/opentelemetry-javaagent.jar" `
        -OutFile $agent
}

mvn -q -DskipTests package

java `
    "-javaagent:$PWD\$agent" `
    '-Dotel.service.name=springboot-otel-sample' `
    '-Dotel.resource.attributes=service.namespace=quasar-tracing,service.version=1.0.0,deployment.environment.name=local' `
    '-Dotel.exporter.otlp.endpoint=http://localhost:4318' `
    '-Dotel.exporter.otlp.protocol=http/protobuf' `
    '-Dotel.traces.sampler=parentbased_always_on' `
    '-Dotel.instrumentation.micrometer.enabled=true' `
    -jar target/springboot-otel-sample.jar
