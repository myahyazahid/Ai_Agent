// src/workspace/entryPointDetector.js

import { readFile } from "node:fs/promises";
import path from "node:path";
import eventBus from "../core/eventBus.js";

/**
 * Convention-based entry point candidates per language/runtime.
 * Ordered by priority within each group.
 *
 * @type {Record<string, string[]>}
 */
const ENTRY_POINT_CONVENTIONS = {
  "Node.js": [
    "src/index.js", "src/index.ts", "src/main.js", "src/main.ts",
    "src/app.js", "src/app.ts", "src/server.js", "src/server.ts",
    "index.js", "index.ts", "main.js", "main.ts",
    "server.js", "server.ts", "app.js", "app.ts",
  ],
  "Python": [
    "main.py", "app.py", "src/main.py", "src/app.py",
    "run.py", "manage.py", "server.py",
  ],
  "Go": [
    "main.go", "cmd/main.go", "cmd/server/main.go",
  ],
  "Rust": [
    "src/main.rs", "src/lib.rs",
  ],
  "Dart VM": [
    "lib/main.dart", "bin/main.dart",
  ],
  "JVM": [
    "src/main/java/Main.java",
    "src/main/java/App.java",
    "src/main/kotlin/Main.kt",
    "src/main/kotlin/App.kt",
  ],
  ".NET": [
    "Program.cs", "src/Program.cs",
  ],
  "Ruby": [
    "app.rb", "main.rb", "config.ru",
    "config/application.rb",
  ],
  "PHP": [
    "public/index.php", "index.php",
    "artisan",
  ],
};

/**
 * Automatically detects the project's entry point file by inspecting
 * package manifests and falling back to convention-based matching.
 */
export class EntryPointDetector {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({ eventBus: detectorEventBus = eventBus } = {}) {
    this.eventBus = detectorEventBus;
  }

  /**
   * Detect the project entry point.
   *
   * Priority:
   *   1. Manifest `main` field (package.json)
   *   2. Manifest `scripts.start` / `scripts.dev` references
   *   3. Convention-based search per runtime
   *
   * @param {object} scanResult
   * @param {string} scanResult.root
   * @param {Array<{relativePath: string, name: string}>} scanResult.files
   * @param {object} projectInfo
   * @param {string | null} projectInfo.runtime
   * @returns {Promise<{
   *   entryPoint: string | null,
   *   candidates: string[]
   * }>}
   */
  async detect(scanResult, projectInfo) {
    this.emitStatus("Detecting entry point", {
      phase: "workspace:entrypoint",
      root: scanResult.root,
      runtime: projectInfo.runtime,
    });

    const relativePaths = new Set(scanResult.files.map((f) => f.relativePath));
    const candidates = [];

    // Strategy 1: package.json `main` field.
    const mainField = await this.detectFromPackageJsonMain(scanResult.root);

    if (mainField && relativePaths.has(mainField)) {
      candidates.push(mainField);
    }

    // Strategy 2: package.json `scripts.start` or `scripts.dev`.
    const scriptEntry = await this.detectFromPackageJsonScripts(scanResult.root);

    if (scriptEntry && relativePaths.has(scriptEntry) && !candidates.includes(scriptEntry)) {
      candidates.push(scriptEntry);
    }

    // Strategy 3: Convention-based search.
    const conventionCandidates = this.detectFromConventions(relativePaths, projectInfo.runtime);

    for (const candidate of conventionCandidates) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }

    return {
      entryPoint: candidates.length > 0 ? candidates[0] : null,
      candidates,
    };
  }

  /**
   * Read the `main` field from package.json.
   *
   * @param {string} root
   * @returns {Promise<string | null>}
   */
  async detectFromPackageJsonMain(root) {
    try {
      const raw = await readFile(path.join(root, "package.json"), "utf8");
      const pkg = JSON.parse(raw);

      if (typeof pkg.main === "string" && pkg.main.trim()) {
        return this.normalizePath(pkg.main.trim());
      }
    } catch {
      // No package.json or invalid JSON.
    }

    return null;
  }

  /**
   * Extract a file reference from package.json scripts.start or scripts.dev.
   *
   * @param {string} root
   * @returns {Promise<string | null>}
   */
  async detectFromPackageJsonScripts(root) {
    try {
      const raw = await readFile(path.join(root, "package.json"), "utf8");
      const pkg = JSON.parse(raw);
      const scripts = pkg.scripts ?? {};

      // Try start first, then dev.
      for (const scriptKey of ["start", "dev"]) {
        const script = scripts[scriptKey];

        if (typeof script !== "string") {
          continue;
        }

        const filePath = this.extractFileFromScript(script);

        if (filePath) {
          return filePath;
        }
      }
    } catch {
      // No package.json or invalid JSON.
    }

    return null;
  }

  /**
   * Extract a file path from a npm script command.
   *
   * Handles patterns like:
   *   "node src/index.js"
   *   "ts-node src/main.ts"
   *   "nodemon server.js"
   *
   * @param {string} script
   * @returns {string | null}
   */
  extractFileFromScript(script) {
    // Match file paths with common JS/TS extensions.
    const match = script.match(
      /(?:node|ts-node|tsx|nodemon|npx\s+tsx?)\s+([\w./-]+\.(?:js|ts|mjs|cjs|mts|cts))/
    );

    if (match) {
      return this.normalizePath(match[1]);
    }

    return null;
  }

  /**
   * Search for entry points using convention-based patterns for the given runtime.
   *
   * @param {Set<string>} relativePaths
   * @param {string | null} runtime
   * @returns {string[]}
   */
  detectFromConventions(relativePaths, runtime) {
    const candidates = [];

    // If runtime is known, search its conventions first.
    if (runtime && ENTRY_POINT_CONVENTIONS[runtime]) {
      for (const candidate of ENTRY_POINT_CONVENTIONS[runtime]) {
        if (relativePaths.has(candidate)) {
          candidates.push(candidate);
        }
      }
    }

    // If no match from the specific runtime, try all conventions.
    if (candidates.length === 0) {
      for (const runtimeConventions of Object.values(ENTRY_POINT_CONVENTIONS)) {
        for (const candidate of runtimeConventions) {
          if (relativePaths.has(candidate) && !candidates.includes(candidate)) {
            candidates.push(candidate);
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Normalize a path to use forward slashes and remove leading `./`.
   *
   * @param {string} filePath
   * @returns {string}
   */
  normalizePath(filePath) {
    return filePath
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
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
      source: "entryPointDetector",
      ...payload,
    });
  }
}

export default new EntryPointDetector();
