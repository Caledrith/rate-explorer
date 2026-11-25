import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm") version "2.4.21"
    application
    id("org.jlleitschuh.gradle.ktlint") version "14.2.0"
}

group = "explorer"
version = "0.1.0"

repositories {
    mavenCentral()
}

val ktorVersion = "3.6.1"
val jacksonVersion = "2.23.0"
val jdbiVersion = "3.55.0"
val flywayVersion = "13.13.0"
val testcontainersVersion = "2.0.5"

dependencies {
    implementation(platform("io.ktor:ktor-bom:$ktorVersion"))
    implementation(platform("com.fasterxml.jackson:jackson-bom:$jacksonVersion"))

    // HTTP
    implementation("io.ktor:ktor-server-core")
    implementation("io.ktor:ktor-server-netty")
    implementation("io.ktor:ktor-server-content-negotiation")
    implementation("io.ktor:ktor-server-status-pages")
    implementation("io.ktor:ktor-server-call-logging")
    implementation("io.ktor:ktor-serialization-jackson")

    // JSON: the same library serves API responses and streams the rate file.
    implementation("com.fasterxml.jackson.core:jackson-core")
    implementation("com.fasterxml.jackson.core:jackson-databind")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("com.fasterxml.jackson.datatype:jackson-datatype-jsr310")

    // Postgres
    implementation("org.postgresql:postgresql:42.7.15")
    implementation("com.zaxxer:HikariCP:7.1.0")
    implementation("org.flywaydb:flyway-core:$flywayVersion")
    implementation("org.flywaydb:flyway-database-postgresql:$flywayVersion")
    implementation("org.jdbi:jdbi3-core:$jdbiVersion")
    implementation("org.jdbi:jdbi3-kotlin:$jdbiVersion")
    implementation("org.jdbi:jdbi3-postgres:$jdbiVersion")

    implementation("ch.qos.logback:logback-classic:1.6.8")

    testImplementation(kotlin("test"))
    testImplementation("io.ktor:ktor-server-test-host")
    testImplementation("io.ktor:ktor-client-content-negotiation")
    testImplementation("org.testcontainers:testcontainers-postgresql:$testcontainersVersion")
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_21
        // Compile against the Java 21 API whichever newer JDK runs the build.
        freeCompilerArgs.add("-Xjdk-release=21")
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

application {
    mainClass = "explorer.ApplicationKt"
}

tasks.test {
    useJUnitPlatform {
        // The real-file check downloads 89 MB; run it on demand with -PrealFile.
        if (!project.hasProperty("realFile")) excludeTags("real-file")
    }
    testLogging {
        events("failed", "skipped")
        showStandardStreams = false
    }
}
