# Render has no native Java runtime, so the API deploys as a Docker service.
# Build context is backend/trevora-api (see rootDir in render.yaml).

# --- build stage -------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Dependencies first so a source-only change reuses the cached layer.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
# Tests need a live Supabase/Postgres, which the build container has no
# credentials for -- they run in CI/locally, not on the deploy path.
RUN mvn -B -DskipTests clean package

# --- runtime stage -----------------------------------------------------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/trevora-api-*.jar app.jar

# Render's free instance is 512 MB; let the JVM size its heap from the
# container limit instead of the default 1/4-of-host guess.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC"

# Render injects PORT; application.properties already reads it.
EXPOSE 8080
CMD ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
