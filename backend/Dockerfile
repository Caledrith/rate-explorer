# Build with the Gradle wrapper so the image uses the same Gradle version as local builds.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts gradle.properties ./
COPY gradle ./gradle
# Resolve dependencies in their own layer so source edits do not re-download them.
RUN ./gradlew --no-daemon -q dependencies > /dev/null
COPY src ./src
RUN ./gradlew --no-daemon -q installDist

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/build/install/rate-explorer-backend ./
ENV PORT=8080
EXPOSE 8080
CMD ["bin/rate-explorer-backend"]
