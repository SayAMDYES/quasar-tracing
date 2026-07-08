# Backend image — builds the Spring Boot read API (quasar-tracing-server) and runs the fat jar.
# Multi-stage: Maven builds the whole multi-module reactor, then a slim JRE runs the server jar.

# --- build stage ---
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
# Copy the full multi-module project (parent pom + all modules) so -am can resolve dependencies.
COPY . .
# Build only the server module and the modules it depends on; tests need ClickHouse, so skip them.
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -pl quasar-tracing-server -am clean package -DskipTests

# --- runtime stage ---
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/quasar-tracing-server/target/quasar-tracing-server.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
