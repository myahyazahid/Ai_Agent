// src/workspace/projectAnalyzer.js

import { readFile } from "node:fs/promises";
import path from "node:path";
import eventBus from "../core/eventBus.js";

/**
 * Configuration files that signal specific project types.
 * Ordered by specificity: more specific patterns checked first.
 *
 * @type {Array<{
 *   file: string,
 *   language: string,
 *   framework: string | null,
 *   runtime: string,
 *   packageManager: string
 * }>}
 */
const CONFIG_SIGNATURES = [
  // JavaScript / TypeScript frameworks (specific → generic)
  { file: "next.config.js", language: "JavaScript", framework: "Next.js", runtime: "Node.js", packageManager: "npm" },
  { file: "next.config.mjs", language: "JavaScript", framework: "Next.js", runtime: "Node.js", packageManager: "npm" },
  { file: "next.config.ts", language: "TypeScript", framework: "Next.js", runtime: "Node.js", packageManager: "npm" },
  { file: "nuxt.config.js", language: "JavaScript", framework: "Nuxt", runtime: "Node.js", packageManager: "npm" },
  { file: "nuxt.config.ts", language: "TypeScript", framework: "Nuxt", runtime: "Node.js", packageManager: "npm" },
  { file: "angular.json", language: "TypeScript", framework: "Angular", runtime: "Node.js", packageManager: "npm" },
  { file: "vite.config.js", language: "JavaScript", framework: "Vite", runtime: "Node.js", packageManager: "npm" },
  { file: "vite.config.ts", language: "TypeScript", framework: "Vite", runtime: "Node.js", packageManager: "npm" },
  { file: "svelte.config.js", language: "JavaScript", framework: "SvelteKit", runtime: "Node.js", packageManager: "npm" },
  { file: "remix.config.js", language: "JavaScript", framework: "Remix", runtime: "Node.js", packageManager: "npm" },
  { file: "astro.config.mjs", language: "JavaScript", framework: "Astro", runtime: "Node.js", packageManager: "npm" },
  { file: "gatsby-config.js", language: "JavaScript", framework: "Gatsby", runtime: "Node.js", packageManager: "npm" },

  // PHP
  { file: "artisan", language: "PHP", framework: "Laravel", runtime: "PHP", packageManager: "composer" },
  { file: "composer.json", language: "PHP", framework: null, runtime: "PHP", packageManager: "composer" },

  // Dart / Flutter
  { file: "pubspec.yaml", language: "Dart", framework: null, runtime: "Dart VM", packageManager: "pub" },

  // Python
  { file: "pyproject.toml", language: "Python", framework: null, runtime: "Python", packageManager: "pip" },
  { file: "setup.py", language: "Python", framework: null, runtime: "Python", packageManager: "pip" },
  { file: "requirements.txt", language: "Python", framework: null, runtime: "Python", packageManager: "pip" },
  { file: "Pipfile", language: "Python", framework: null, runtime: "Python", packageManager: "pipenv" },

  // Rust
  { file: "Cargo.toml", language: "Rust", framework: null, runtime: "Rust", packageManager: "cargo" },

  // Go
  { file: "go.mod", language: "Go", framework: null, runtime: "Go", packageManager: "go modules" },

  // Java / Kotlin
  { file: "pom.xml", language: "Java", framework: null, runtime: "JVM", packageManager: "maven" },
  { file: "build.gradle", language: "Java", framework: null, runtime: "JVM", packageManager: "gradle" },
  { file: "build.gradle.kts", language: "Kotlin", framework: null, runtime: "JVM", packageManager: "gradle" },

  // Ruby
  { file: "Gemfile", language: "Ruby", framework: null, runtime: "Ruby", packageManager: "bundler" },

  // .NET / C#
  // Note: .csproj detection handled separately via extension matching.

  // Generic JS/TS (lowest priority)
  { file: "package.json", language: "JavaScript", framework: null, runtime: "Node.js", packageManager: "npm" },
  { file: "tsconfig.json", language: "TypeScript", framework: null, runtime: "Node.js", packageManager: "npm" },
];

/**
 * Known framework dependencies in package.json.
 * Maps dependency name to detected framework.
 *
 * @type {Array<{dependency: string, framework: string}>}
 */
const JS_FRAMEWORK_DEPENDENCIES = [
  { dependency: "next", framework: "Next.js" },
  { dependency: "nuxt", framework: "Nuxt" },
  { dependency: "@angular/core", framework: "Angular" },
  { dependency: "react", framework: "React" },
  { dependency: "vue", framework: "Vue" },
  { dependency: "svelte", framework: "Svelte" },
  { dependency: "@sveltejs/kit", framework: "SvelteKit" },
  { dependency: "remix", framework: "Remix" },
  { dependency: "@remix-run/node", framework: "Remix" },
  { dependency: "astro", framework: "Astro" },
  { dependency: "gatsby", framework: "Gatsby" },
  { dependency: "express", framework: "Express" },
  { dependency: "fastify", framework: "Fastify" },
  { dependency: "hono", framework: "Hono" },
  { dependency: "koa", framework: "Koa" },
  { dependency: "nestjs", framework: "NestJS" },
  { dependency: "@nestjs/core", framework: "NestJS" },
  { dependency: "electron", framework: "Electron" },
];

/**
 * Lockfile-to-package-manager mapping.
 * @type {Array<{file: string, packageManager: string}>}
 */
const LOCKFILE_MAP = [
  { file: "yarn.lock", packageManager: "yarn" },
  { file: "pnpm-lock.yaml", packageManager: "pnpm" },
  { file: "bun.lockb", packageManager: "bun" },
  { file: "package-lock.json", packageManager: "npm" },
];

/**
 * Analyzes a scanned workspace to detect the project's language, framework,
 * runtime, and package manager.
 */
export class ProjectAnalyzer {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({ eventBus: analyzerEventBus = eventBus } = {}) {
    this.eventBus = analyzerEventBus;
  }

  /**
   * Analyze a scan result and return project identity information.
   *
   * @param {object} scanResult
   * @param {string} scanResult.root
   * @param {Array<{name: string, relativePath: string}>} scanResult.files
   * @returns {Promise<{
   *   language: string | null,
   *   framework: string | null,
   *   runtime: string | null,
   *   packageManager: string | null,
   *   configFiles: string[]
   * }>}
   */
  async analyze(scanResult) {
    this.emitStatus("Analyzing project", {
      phase: "workspace:analyzing",
      root: scanResult.root,
    });

    const fileNames = new Set(scanResult.files.map((f) => f.name));
    const configFiles = this.detectConfigFiles(fileNames);
    const baseResult = this.matchConfigSignature(fileNames);

    // Refine framework detection for JS/TS projects via package.json deps.
    if (baseResult.language === "JavaScript" || baseResult.language === "TypeScript") {
      const frameworkFromDeps = await this.detectFrameworkFromPackageJson(scanResult.root);

      if (frameworkFromDeps) {
        baseResult.framework = frameworkFromDeps;
      }

      // Upgrade language to TypeScript if tsconfig.json is present.
      if (fileNames.has("tsconfig.json")) {
        baseResult.language = "TypeScript";
      }
    }

    // Refine package manager from lockfile.
    const lockfileManager = this.detectPackageManagerFromLockfile(fileNames);

    if (lockfileManager) {
      baseResult.packageManager = lockfileManager;
    }

    // Detect Flutter from pubspec.yaml deps.
    if (baseResult.language === "Dart") {
      const isFlutter = await this.detectFlutterFromPubspec(scanResult.root);

      if (isFlutter) {
        baseResult.framework = "Flutter";
      }
    }

    // Detect Laravel from composer.json deps.
    if (baseResult.language === "PHP" && !baseResult.framework) {
      const isLaravel = await this.detectLaravelFromComposer(scanResult.root);

      if (isLaravel) {
        baseResult.framework = "Laravel";
      }
    }

    // Detect Rails from Gemfile.
    if (baseResult.language === "Ruby" && !baseResult.framework) {
      const isRails = await this.detectRailsFromGemfile(scanResult.root);

      if (isRails) {
        baseResult.framework = "Rails";
      }
    }

    // Detect .csproj for C# projects.
    if (!baseResult.language) {
      const csprojFile = scanResult.files.find((f) => f.extension === ".csproj");

      if (csprojFile) {
        baseResult.language = "C#";
        baseResult.runtime = ".NET";
        baseResult.packageManager = "dotnet";
      }
    }

    return {
      ...baseResult,
      configFiles,
    };
  }

  /**
   * Match the first config signature found in the workspace files.
   *
   * @param {Set<string>} fileNames
   * @returns {{
   *   language: string | null,
   *   framework: string | null,
   *   runtime: string | null,
   *   packageManager: string | null
   * }}
   */
  matchConfigSignature(fileNames) {
    for (const sig of CONFIG_SIGNATURES) {
      if (fileNames.has(sig.file)) {
        return {
          language: sig.language,
          framework: sig.framework,
          runtime: sig.runtime,
          packageManager: sig.packageManager,
        };
      }
    }

    return {
      language: null,
      framework: null,
      runtime: null,
      packageManager: null,
    };
  }

  /**
   * Detect known config files present in the workspace.
   *
   * @param {Set<string>} fileNames
   * @returns {string[]}
   */
  detectConfigFiles(fileNames) {
    const knownConfigs = [
      "package.json", "tsconfig.json", "jsconfig.json",
      "next.config.js", "next.config.mjs", "next.config.ts",
      "vite.config.js", "vite.config.ts",
      "angular.json", "nuxt.config.js", "nuxt.config.ts",
      "svelte.config.js", "astro.config.mjs",
      "composer.json", "artisan",
      "pubspec.yaml",
      "requirements.txt", "pyproject.toml", "setup.py", "Pipfile",
      "Cargo.toml",
      "go.mod", "go.sum",
      "pom.xml", "build.gradle", "build.gradle.kts",
      "Gemfile",
      ".gitignore", ".env", ".env.example",
      "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
      "Makefile", "CMakeLists.txt",
      "README.md", "LICENSE",
    ];

    return knownConfigs.filter((name) => fileNames.has(name));
  }

  /**
   * Detect package manager from lockfile presence.
   *
   * @param {Set<string>} fileNames
   * @returns {string | null}
   */
  detectPackageManagerFromLockfile(fileNames) {
    for (const entry of LOCKFILE_MAP) {
      if (fileNames.has(entry.file)) {
        return entry.packageManager;
      }
    }

    return null;
  }

  /**
   * Read package.json and detect framework from dependencies.
   *
   * @param {string} root
   * @returns {Promise<string | null>}
   */
  async detectFrameworkFromPackageJson(root) {
    try {
      const raw = await readFile(path.join(root, "package.json"), "utf8");
      const pkg = JSON.parse(raw);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      for (const entry of JS_FRAMEWORK_DEPENDENCIES) {
        if (allDeps[entry.dependency]) {
          return entry.framework;
        }
      }
    } catch {
      // package.json not readable or not valid JSON.
    }

    return null;
  }

  /**
   * Detect Flutter from pubspec.yaml by checking for flutter SDK dependency.
   *
   * @param {string} root
   * @returns {Promise<boolean>}
   */
  async detectFlutterFromPubspec(root) {
    try {
      const raw = await readFile(path.join(root, "pubspec.yaml"), "utf8");
      return raw.includes("flutter:") && raw.includes("sdk: flutter");
    } catch {
      return false;
    }
  }

  /**
   * Detect Laravel from composer.json by checking for laravel/framework.
   *
   * @param {string} root
   * @returns {Promise<boolean>}
   */
  async detectLaravelFromComposer(root) {
    try {
      const raw = await readFile(path.join(root, "composer.json"), "utf8");
      const composer = JSON.parse(raw);
      const allDeps = { ...composer.require, ...composer["require-dev"] };
      return "laravel/framework" in allDeps;
    } catch {
      return false;
    }
  }

  /**
   * Detect Rails from Gemfile by checking for rails gem.
   *
   * @param {string} root
   * @returns {Promise<boolean>}
   */
  async detectRailsFromGemfile(root) {
    try {
      const raw = await readFile(path.join(root, "Gemfile"), "utf8");
      return /gem\s+['"]rails['"]/.test(raw);
    } catch {
      return false;
    }
  }

  /**
   * Emit a status event.
   *
   * @param {string} message
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitStatus(message, payload = {}) {
    if (!this.eventBus) {
      return false;
    }

    return this.eventBus.emitStatus(message, {
      source: "projectAnalyzer",
      ...payload,
    });
  }
}

export default new ProjectAnalyzer();
