import type { ProjectSpec } from "../../types/projectspec";
import { detectPrimaryEcosystem, type Ecosystem } from "./shared";

/**
 * Ecosystem layer — the single source of truth for language-specific
 * conventions used by every generator.
 *
 * The generators historically hardcoded TypeScript/web conventions
 * (`src/x.ts`, `import { z } from 'zod'`, Vitest, npm). That produced broken
 * packages for Rust, Python, Go, and every other ecosystem. This module maps
 * a detected {@link Ecosystem} to the correct conventions so downstream
 * generators (prompts.ts, docs.ts, shared.ts) can emit paths, imports, test
 * files, and commands that match the project's actual language.
 *
 * Detection itself lives in `shared.ts` (`detectPrimaryEcosystem`); this file
 * only turns a known ecosystem into concrete, reusable conventions.
 */
export interface EcosystemProfile {
  /** The ecosystem these conventions belong to. */
  ecosystem: Ecosystem;
  /** Human-readable language name for prose in generated docs. */
  displayName: string;
  /** Primary source-file extension, including the dot (e.g. ".rs"). */
  sourceExtension: string;
  /** Conventional root directory for source files (e.g. "src"). */
  sourceDir: string;
  /** Test-file extension, including the dot (may equal sourceExtension). */
  testExtension: string;
  /** Conventional directory for tests (empty string = colocated with source). */
  testDir: string;
  /** Package/dependency manager (e.g. "cargo", "pip", "npm"). */
  packageManager: string;
  /** Test runner / command name (e.g. "cargo test", "pytest"). */
  testRunner: string;
  /** Manifest file that lists dependencies (e.g. "Cargo.toml"). */
  manifestFile: string;
  /** Command to install dependencies. */
  installCommand: string;
  /** Command to build/compile (empty string when not applicable). */
  buildCommand: string;
  /** Command to run the test suite. */
  testCommand: string;
  /** Fenced-code-block language tag for markdown (e.g. "rust"). */
  codeFenceTag: string;
  /**
   * Builds a conventional relative source path for a module name.
   * e.g. rust: modulePath("auth") -> "src/auth.rs"
   */
  modulePath: (name: string) => string;
  /**
   * Builds a conventional relative test path for a module name.
   * e.g. python: testPath("auth") -> "tests/test_auth.py"
   */
  testPath: (name: string) => string;
  /** A minimal, idiomatic "module" snippet the AI can pattern-match against. */
  exampleModule: string;
  /** A minimal, idiomatic test snippet for this ecosystem. */
  exampleTest: string;
}

function sanitizeModuleName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "module"
  );
}

const PROFILES: Record<Ecosystem, EcosystemProfile> = {
  typescript: {
    ecosystem: "typescript",
    displayName: "TypeScript",
    sourceExtension: ".ts",
    sourceDir: "src",
    testExtension: ".test.ts",
    testDir: "src",
    packageManager: "npm",
    testRunner: "vitest",
    manifestFile: "package.json",
    installCommand: "npm install",
    buildCommand: "npm run build",
    testCommand: "npm test",
    codeFenceTag: "typescript",
    modulePath: (name) => `src/${sanitizeModuleName(name).replace(/_/g, "-")}.ts`,
    testPath: (name) => `src/${sanitizeModuleName(name).replace(/_/g, "-")}.test.ts`,
    exampleModule: [
      "// src/auth.ts",
      "export function greet(name: string): string {",
      "  return `Hello, ${name}`;",
      "}",
    ].join("\n"),
    exampleTest: [
      "// src/auth.test.ts",
      "import { describe, it, expect } from 'vitest';",
      "import { greet } from './auth';",
      "",
      "describe('greet', () => {",
      "  it('greets by name', () => {",
      "    expect(greet('Ada')).toBe('Hello, Ada');",
      "  });",
      "});",
    ].join("\n"),
  },
  javascript: {
    ecosystem: "javascript",
    displayName: "JavaScript",
    sourceExtension: ".js",
    sourceDir: "src",
    testExtension: ".test.js",
    testDir: "src",
    packageManager: "npm",
    testRunner: "vitest",
    manifestFile: "package.json",
    installCommand: "npm install",
    buildCommand: "",
    testCommand: "npm test",
    codeFenceTag: "javascript",
    modulePath: (name) => `src/${sanitizeModuleName(name).replace(/_/g, "-")}.js`,
    testPath: (name) => `src/${sanitizeModuleName(name).replace(/_/g, "-")}.test.js`,
    exampleModule: [
      "// src/auth.js",
      "export function greet(name) {",
      "  return `Hello, ${name}`;",
      "}",
    ].join("\n"),
    exampleTest: [
      "// src/auth.test.js",
      "import { describe, it, expect } from 'vitest';",
      "import { greet } from './auth.js';",
      "",
      "describe('greet', () => {",
      "  it('greets by name', () => {",
      "    expect(greet('Ada')).toBe('Hello, Ada');",
      "  });",
      "});",
    ].join("\n"),
  },
  python: {
    ecosystem: "python",
    displayName: "Python",
    sourceExtension: ".py",
    sourceDir: "src",
    testExtension: ".py",
    testDir: "tests",
    packageManager: "pip",
    testRunner: "pytest",
    manifestFile: "pyproject.toml",
    installCommand: "pip install -e .",
    buildCommand: "",
    testCommand: "pytest",
    codeFenceTag: "python",
    modulePath: (name) => `src/${sanitizeModuleName(name)}.py`,
    testPath: (name) => `tests/test_${sanitizeModuleName(name)}.py`,
    exampleModule: [
      "# src/auth.py",
      "def greet(name: str) -> str:",
      '    return f"Hello, {name}"',
    ].join("\n"),
    exampleTest: [
      "# tests/test_auth.py",
      "from src.auth import greet",
      "",
      "def test_greet():",
      '    assert greet("Ada") == "Hello, Ada"',
    ].join("\n"),
  },
  rust: {
    ecosystem: "rust",
    displayName: "Rust",
    sourceExtension: ".rs",
    sourceDir: "src",
    testExtension: ".rs",
    testDir: "tests",
    packageManager: "cargo",
    testRunner: "cargo test",
    manifestFile: "Cargo.toml",
    installCommand: "cargo fetch",
    buildCommand: "cargo build",
    testCommand: "cargo test",
    codeFenceTag: "rust",
    modulePath: (name) => `src/${sanitizeModuleName(name)}.rs`,
    testPath: (name) => `tests/${sanitizeModuleName(name)}.rs`,
    exampleModule: [
      "// src/auth.rs",
      "pub fn greet(name: &str) -> String {",
      '    format!("Hello, {name}")',
      "}",
    ].join("\n"),
    exampleTest: [
      "// tests/auth.rs",
      "use my_crate::auth::greet;",
      "",
      "#[test]",
      "fn greets_by_name() {",
      '    assert_eq!(greet("Ada"), "Hello, Ada");',
      "}",
    ].join("\n"),
  },
  go: {
    ecosystem: "go",
    displayName: "Go",
    sourceExtension: ".go",
    sourceDir: ".",
    testExtension: "_test.go",
    testDir: ".",
    packageManager: "go mod",
    testRunner: "go test",
    manifestFile: "go.mod",
    installCommand: "go mod download",
    buildCommand: "go build ./...",
    testCommand: "go test ./...",
    codeFenceTag: "go",
    modulePath: (name) => `${sanitizeModuleName(name)}/${sanitizeModuleName(name)}.go`,
    testPath: (name) => `${sanitizeModuleName(name)}/${sanitizeModuleName(name)}_test.go`,
    exampleModule: [
      "// auth/auth.go",
      "package auth",
      "",
      "import \"fmt\"",
      "",
      "func Greet(name string) string {",
      '    return fmt.Sprintf("Hello, %s", name)',
      "}",
    ].join("\n"),
    exampleTest: [
      "// auth/auth_test.go",
      "package auth",
      "",
      "import \"testing\"",
      "",
      "func TestGreet(t *testing.T) {",
      '    if got := Greet("Ada"); got != "Hello, Ada" {',
      '        t.Errorf("got %q", got)',
      "    }",
      "}",
    ].join("\n"),
  },
  java: {
    ecosystem: "java",
    displayName: "Java",
    sourceExtension: ".java",
    sourceDir: "src/main/java",
    testExtension: ".java",
    testDir: "src/test/java",
    packageManager: "maven",
    testRunner: "junit",
    manifestFile: "pom.xml",
    installCommand: "mvn install",
    buildCommand: "mvn compile",
    testCommand: "mvn test",
    codeFenceTag: "java",
    modulePath: (name) => `src/main/java/${sanitizeModuleName(name)}/${sanitizeModuleName(name)}.java`,
    testPath: (name) => `src/test/java/${sanitizeModuleName(name)}/${sanitizeModuleName(name)}Test.java`,
    exampleModule: [
      "// src/main/java/auth/Auth.java",
      "package auth;",
      "",
      "public class Auth {",
      "    public static String greet(String name) {",
      '        return "Hello, " + name;',
      "    }",
      "}",
    ].join("\n"),
    exampleTest: [
      "// src/test/java/auth/AuthTest.java",
      "package auth;",
      "",
      "import org.junit.jupiter.api.Test;",
      "import static org.junit.jupiter.api.Assertions.assertEquals;",
      "",
      "class AuthTest {",
      "    @Test",
      "    void greetsByName() {",
      '        assertEquals("Hello, Ada", Auth.greet("Ada"));',
      "    }",
      "}",
    ].join("\n"),
  },
  kotlin: {
    ecosystem: "kotlin",
    displayName: "Kotlin",
    sourceExtension: ".kt",
    sourceDir: "src/main/kotlin",
    testExtension: ".kt",
    testDir: "src/test/kotlin",
    packageManager: "gradle",
    testRunner: "junit",
    manifestFile: "build.gradle.kts",
    installCommand: "./gradlew build",
    buildCommand: "./gradlew build",
    testCommand: "./gradlew test",
    codeFenceTag: "kotlin",
    modulePath: (name) => `src/main/kotlin/${sanitizeModuleName(name)}/${sanitizeModuleName(name)}.kt`,
    testPath: (name) => `src/test/kotlin/${sanitizeModuleName(name)}/${sanitizeModuleName(name)}Test.kt`,
    exampleModule: [
      "// src/main/kotlin/auth/Auth.kt",
      "package auth",
      "",
      "fun greet(name: String): String = \"Hello, $name\"",
    ].join("\n"),
    exampleTest: [
      "// src/test/kotlin/auth/AuthTest.kt",
      "package auth",
      "",
      "import kotlin.test.Test",
      "import kotlin.test.assertEquals",
      "",
      "class AuthTest {",
      "    @Test",
      "    fun greetsByName() {",
      '        assertEquals("Hello, Ada", greet("Ada"))',
      "    }",
      "}",
    ].join("\n"),
  },
  swift: {
    ecosystem: "swift",
    displayName: "Swift",
    sourceExtension: ".swift",
    sourceDir: "Sources",
    testExtension: ".swift",
    testDir: "Tests",
    packageManager: "swift package manager",
    testRunner: "XCTest",
    manifestFile: "Package.swift",
    installCommand: "swift package resolve",
    buildCommand: "swift build",
    testCommand: "swift test",
    codeFenceTag: "swift",
    modulePath: (name) => `Sources/${sanitizeModuleName(name)}/${sanitizeModuleName(name)}.swift`,
    testPath: (name) => `Tests/${sanitizeModuleName(name)}Tests/${sanitizeModuleName(name)}Tests.swift`,
    exampleModule: [
      "// Sources/Auth/Auth.swift",
      "public func greet(_ name: String) -> String {",
      '    "Hello, \\(name)"',
      "}",
    ].join("\n"),
    exampleTest: [
      "// Tests/AuthTests/AuthTests.swift",
      "import XCTest",
      "@testable import Auth",
      "",
      "final class AuthTests: XCTestCase {",
      "    func testGreet() {",
      '        XCTAssertEqual(greet("Ada"), "Hello, Ada")',
      "    }",
      "}",
    ].join("\n"),
  },
  csharp: {
    ecosystem: "csharp",
    displayName: "C#",
    sourceExtension: ".cs",
    sourceDir: "src",
    testExtension: ".cs",
    testDir: "tests",
    packageManager: "dotnet",
    testRunner: "xunit",
    manifestFile: "*.csproj",
    installCommand: "dotnet restore",
    buildCommand: "dotnet build",
    testCommand: "dotnet test",
    codeFenceTag: "csharp",
    modulePath: (name) => `src/${sanitizeModuleName(name)}/${sanitizeModuleName(name)}.cs`,
    testPath: (name) => `tests/${sanitizeModuleName(name)}Tests.cs`,
    exampleModule: [
      "// src/Auth/Auth.cs",
      "namespace App;",
      "",
      "public static class Auth",
      "{",
      '    public static string Greet(string name) => $"Hello, {name}";',
      "}",
    ].join("\n"),
    exampleTest: [
      "// tests/AuthTests.cs",
      "using Xunit;",
      "",
      "public class AuthTests",
      "{",
      "    [Fact]",
      "    public void GreetsByName()",
      "    {",
      '        Assert.Equal("Hello, Ada", App.Auth.Greet("Ada"));',
      "    }",
      "}",
    ].join("\n"),
  },
  cpp: {
    ecosystem: "cpp",
    displayName: "C++",
    sourceExtension: ".cpp",
    sourceDir: "src",
    testExtension: ".cpp",
    testDir: "tests",
    packageManager: "cmake",
    testRunner: "ctest",
    manifestFile: "CMakeLists.txt",
    installCommand: "cmake -B build",
    buildCommand: "cmake --build build",
    testCommand: "ctest --test-dir build",
    codeFenceTag: "cpp",
    modulePath: (name) => `src/${sanitizeModuleName(name)}.cpp`,
    testPath: (name) => `tests/${sanitizeModuleName(name)}_test.cpp`,
    exampleModule: [
      "// src/auth.cpp",
      "#include <string>",
      "",
      "std::string greet(const std::string& name) {",
      '    return "Hello, " + name;',
      "}",
    ].join("\n"),
    exampleTest: [
      "// tests/auth_test.cpp",
      "#include <cassert>",
      "#include <string>",
      "",
      "std::string greet(const std::string& name);",
      "",
      "int main() {",
      '    assert(greet("Ada") == "Hello, Ada");',
      "    return 0;",
      "}",
    ].join("\n"),
  },
  ruby: {
    ecosystem: "ruby",
    displayName: "Ruby",
    sourceExtension: ".rb",
    sourceDir: "lib",
    testExtension: ".rb",
    testDir: "spec",
    packageManager: "bundler",
    testRunner: "rspec",
    manifestFile: "Gemfile",
    installCommand: "bundle install",
    buildCommand: "",
    testCommand: "bundle exec rspec",
    codeFenceTag: "ruby",
    modulePath: (name) => `lib/${sanitizeModuleName(name)}.rb`,
    testPath: (name) => `spec/${sanitizeModuleName(name)}_spec.rb`,
    exampleModule: [
      "# lib/auth.rb",
      "def greet(name)",
      '  "Hello, #{name}"',
      "end",
    ].join("\n"),
    exampleTest: [
      "# spec/auth_spec.rb",
      "require_relative '../lib/auth'",
      "",
      "RSpec.describe '#greet' do",
      "  it 'greets by name' do",
      '    expect(greet("Ada")).to eq("Hello, Ada")',
      "  end",
      "end",
    ].join("\n"),
  },
  php: {
    ecosystem: "php",
    displayName: "PHP",
    sourceExtension: ".php",
    sourceDir: "src",
    testExtension: ".php",
    testDir: "tests",
    packageManager: "composer",
    testRunner: "phpunit",
    manifestFile: "composer.json",
    installCommand: "composer install",
    buildCommand: "",
    testCommand: "vendor/bin/phpunit",
    codeFenceTag: "php",
    modulePath: (name) => `src/${sanitizeModuleName(name)}.php`,
    testPath: (name) => `tests/${sanitizeModuleName(name)}Test.php`,
    exampleModule: [
      "<?php",
      "// src/auth.php",
      "function greet(string $name): string {",
      '    return "Hello, {$name}";',
      "}",
    ].join("\n"),
    exampleTest: [
      "<?php",
      "// tests/AuthTest.php",
      "use PHPUnit\\Framework\\TestCase;",
      "require_once __DIR__ . '/../src/auth.php';",
      "",
      "class AuthTest extends TestCase {",
      "    public function testGreetsByName(): void {",
      '        $this->assertSame("Hello, Ada", greet("Ada"));',
      "    }",
      "}",
    ].join("\n"),
  },
  unknown: {
    ecosystem: "unknown",
    displayName: "the project's language",
    sourceExtension: "",
    sourceDir: "src",
    testExtension: "",
    testDir: "tests",
    packageManager: "the project's package manager",
    testRunner: "the project's test runner",
    manifestFile: "the project's manifest file",
    installCommand: "# install dependencies using the project's package manager",
    buildCommand: "",
    testCommand: "# run the project's test suite",
    codeFenceTag: "",
    modulePath: (name) => `src/${sanitizeModuleName(name)}`,
    testPath: (name) => `tests/${sanitizeModuleName(name)}`,
    exampleModule: "// Implement using the idioms of the project's primary language.",
    exampleTest: "// Add a test using the project's standard test framework.",
  },
};

/** Returns the conventions for a given ecosystem. */
export function getEcosystemProfile(ecosystem: Ecosystem): EcosystemProfile {
  return PROFILES[ecosystem] ?? PROFILES.unknown;
}

/** Detects the project's ecosystem and returns its full convention profile. */
export function resolveEcosystemProfile(spec: ProjectSpec): EcosystemProfile {
  return getEcosystemProfile(detectPrimaryEcosystem(spec));
}

/**
 * Builds a markdown block, injectable into any AI prompt, that pins the
 * language-specific conventions the generated code MUST follow. This is what
 * stops a Rust project from receiving `src/x.ts` paths and Vitest tests.
 */
export function buildEcosystemContext(spec: ProjectSpec): string {
  const p = resolveEcosystemProfile(spec);
  if (p.ecosystem === "unknown") return "";

  return `
## Language & Ecosystem Conventions — MANDATORY

This project's primary language is **${p.displayName}**. Every file, path,
import, and command you generate MUST follow ${p.displayName} conventions.
Do NOT emit TypeScript/JavaScript paths, imports, or tooling unless the
language above is JavaScript or TypeScript.

- **Source files:** \`${p.sourceDir}/\` using the \`${p.sourceExtension}\` extension
- **Test files:** \`${p.testDir}/\` using the ${p.testRunner} test runner
- **Package manager:** ${p.packageManager} (manifest: \`${p.manifestFile}\`)
- **Install:** \`${p.installCommand}\`${p.buildCommand ? `\n- **Build:** \`${p.buildCommand}\`` : ""}
- **Test:** \`${p.testCommand}\`

### Canonical module pattern
\`\`\`${p.codeFenceTag}
${p.exampleModule}
\`\`\`

### Canonical test pattern
\`\`\`${p.codeFenceTag}
${p.exampleTest}
\`\`\`

Use these patterns verbatim as the structural template. Do not substitute
another language's idioms.
`;
}
