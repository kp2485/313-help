plugins {
    alias(libs.plugins.kotlin.jvm)
}

// The query rules are plain Kotlin/JVM with no dependencies, so they run in a unit test on a laptop with nothing
// but a JDK and Kotlin, and compile unchanged into the Android app. This is the module that must agree with
// packages/query and apps/ios/Sources/DetroitQuery, case for case, on schema/fixtures.

kotlin {
    jvmToolchain(17)
    compilerOptions {
        // The APK gets no Kotlin metadata it does not need, and nothing here uses reflection.
        freeCompilerArgs.add("-Xjvm-default=all")
    }
}

dependencies {
    testImplementation(libs.junit)
}

val repoRoot = layout.projectDirectory.dir("../../..")

tasks.withType<Test>().configureEach {
    useJUnit()
    // The fixtures live in the repository, not in the module, so both are always the same files.
    systemProperty("fixtures.dir", repoRoot.dir("schema/fixtures").asFile.absolutePath)
    testLogging { showStandardStreams = true }
}

/** The same fixture run without JUnit: `./gradlew :query:runFixtures`. */
tasks.register<JavaExec>("runFixtures") {
    group = "verification"
    description = "Runs every case in schema/fixtures with no test framework."
    mainClass.set("org.help313.query.FixturesKt")
    classpath = sourceSets["test"].runtimeClasspath
    systemProperty("fixtures.dir", repoRoot.dir("schema/fixtures").asFile.absolutePath)
}
