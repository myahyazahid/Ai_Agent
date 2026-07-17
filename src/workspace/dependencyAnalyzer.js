// src/workspace/dependencyAnalyzer.js

import { readFile } from "node:fs/promises";
import path from "node:path";
import eventBus from "../core/eventBus.js";

/**
 * Reads project dependency manifests and extracts structured dependency data.
 *
 * Supports multiple ecosystems without external parsing libraries:
 * - JS/TS: package.json (JSON.parse)
 * - PHP: composer.json (JSON.parse)
 * - Dart: pubspec.yaml (simple line parser)
 * - Python: requirements.txt (line parser)
 * - Rust: Cargo.toml (section parser)
 */
export class DependencyAnalyzer {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({ eventBus: analyzerEventBus = eventBus } = {}) {
    this.eventBus = analyzerEventBus;
  }

  /**
   * Analyze dependencies for the detected project type.
   *
   * @param {object} scanResult
   * @param {string} scanResult.root
   * @param {Array<{name: string}>} scanResult.files
   * @param {object} projectInfo
   * @param {string | null} projectInfo.language
   * @returns {Promise<{
   *   dependencies: Array<{name: string, version: string}>,
   *   devDependencies: Array<{name: string, version: string}>,
   *   totalCount: number
   * }>}
   */
  async analyze(scanResult, projectInfo) {
    this.emitStatus("Reading dependencies", {
      phase: "workspace:dependencies",
      root: scanResult.root,
    });

    const fileNames = new Set(scanResult.files.map((f) => f.name));
    const root = scanResult.root;

    // JSON-based manifests (JS, PHP).
    if (fileNames.has("package.json")) {
      return this.parsePackageJson(root);
    }

    if (fileNames.has("composer.json")) {
      return this.parseComposerJson(root);
    }

    // Line-based manifests.
    if (fileNames.has("pubspec.yaml")) {
      return this.parsePubspecYaml(root);
    }

    if (fileNames.has("requirements.txt")) {
      return this.parseRequirementsTxt(root);
    }

    if (fileNames.has("Cargo.toml")) {
      return this.parseCargoToml(root);
    }

    if (fileNames.has("go.mod")) {
      return this.parseGoMod(root);
    }

    return this.emptyResult();
  }

  /**
   * Parse dependencies from package.json.
   *
   * @param {string} root
   * @returns {Promise<{dependencies: Array<{name: string, version: string}>, devDependencies: Array<{name: string, version: string}>, totalCount: number}>}
   */
  async parsePackageJson(root) {
    try {
      const raw = await readFile(path.join(root, "package.json"), "utf8");
      const pkg = JSON.parse(raw);

      const dependencies = this.objectToDepList(pkg.dependencies);
      const devDependencies = this.objectToDepList(pkg.devDependencies);

      return {
        dependencies,
        devDependencies,
        totalCount: dependencies.length + devDependencies.length,
      };
    } catch {
      return this.emptyResult();
    }
  }

  /**
   * Parse dependencies from composer.json.
   *
   * @param {string} root
   * @returns {Promise<{dependencies: Array<{name: string, version: string}>, devDependencies: Array<{name: string, version: string}>, totalCount: number}>}
   */
  async parseComposerJson(root) {
    try {
      const raw = await readFile(path.join(root, "composer.json"), "utf8");
      const composer = JSON.parse(raw);

      const dependencies = this.objectToDepList(composer.require);
      const devDependencies = this.objectToDepList(composer["require-dev"]);

      return {
        dependencies,
        devDependencies,
        totalCount: dependencies.length + devDependencies.length,
      };
    } catch {
      return this.emptyResult();
    }
  }

  /**
   * Parse dependencies from pubspec.yaml using a simple line parser.
   * Handles flat key-value pairs under `dependencies:` and `dev_dependencies:`.
   *
   * @param {string} root
   * @returns {Promise<{dependencies: Array<{name: string, version: string}>, devDependencies: Array<{name: string, version: string}>, totalCount: number}>}
   */
  async parsePubspecYaml(root) {
    try {
      const raw = await readFile(path.join(root, "pubspec.yaml"), "utf8");
      const lines = raw.split("\n");

      const dependencies = this.parseYamlSection(lines, "dependencies:");
      const devDependencies = this.parseYamlSection(lines, "dev_dependencies:");

      return {
        dependencies,
        devDependencies,
        totalCount: dependencies.length + devDependencies.length,
      };
    } catch {
      return this.emptyResult();
    }
  }

  /**
   * Parse dependencies from requirements.txt.
   *
   * @param {string} root
   * @returns {Promise<{dependencies: Array<{name: string, version: string}>, devDependencies: Array<{name: string, version: string}>, totalCount: number}>}
   */
  async parseRequirementsTxt(root) {
    try {
      const raw = await readFile(path.join(root, "requirements.txt"), "utf8");
      const dependencies = raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && !line.startsWith("-"))
        .map((line) => {
          const match = line.match(/^([a-zA-Z0-9_.-]+)\s*([><=!~]+\s*[\d.]+)?/);

          if (!match) {
            return null;
          }

          return {
            name: match[1],
            version: match[2] ? match[2].trim() : "*",
          };
        })
        .filter(Boolean);

      return {
        dependencies,
        devDependencies: [],
        totalCount: dependencies.length,
      };
    } catch {
      return this.emptyResult();
    }
  }

  /**
   * Parse dependencies from Cargo.toml using a simple section parser.
   *
   * @param {string} root
   * @returns {Promise<{dependencies: Array<{name: string, version: string}>, devDependencies: Array<{name: string, version: string}>, totalCount: number}>}
   */
  async parseCargoToml(root) {
    try {
      const raw = await readFile(path.join(root, "Cargo.toml"), "utf8");

      const dependencies = this.parseTomlSection(raw, "[dependencies]");
      const devDependencies = this.parseTomlSection(raw, "[dev-dependencies]");

      return {
        dependencies,
        devDependencies,
        totalCount: dependencies.length + devDependencies.length,
      };
    } catch {
      return this.emptyResult();
    }
  }

  /**
   * Parse dependencies from go.mod.
   *
   * @param {string} root
   * @returns {Promise<{dependencies: Array<{name: string, version: string}>, devDependencies: Array<{name: string, version: string}>, totalCount: number}>}
   */
  async parseGoMod(root) {
    try {
      const raw = await readFile(path.join(root, "go.mod"), "utf8");
      const requireBlock = raw.match(/require\s*\(([\s\S]*?)\)/);

      if (!requireBlock) {
        return this.emptyResult();
      }

      const dependencies = requireBlock[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//"))
        .map((line) => {
          const parts = line.split(/\s+/);
          return parts.length >= 2
            ? { name: parts[0], version: parts[1] }
            : null;
        })
        .filter(Boolean);

      return {
        dependencies,
        devDependencies: [],
        totalCount: dependencies.length,
      };
    } catch {
      return this.emptyResult();
    }
  }

  /**
   * Convert an object of { name: version } entries into a dependency list.
   *
   * @param {Record<string, string> | undefined} obj
   * @returns {Array<{name: string, version: string}>}
   */
  objectToDepList(obj) {
    if (!obj || typeof obj !== "object") {
      return [];
    }

    return Object.entries(obj).map(([name, version]) => ({
      name,
      version: typeof version === "string" ? version : "*",
    }));
  }

  /**
   * Parse a YAML section's key-value pairs using simple line parsing.
   * Works for flat dependency sections like those in pubspec.yaml.
   *
   * @param {string[]} lines
   * @param {string} sectionHeader
   * @returns {Array<{name: string, version: string}>}
   */
  parseYamlSection(lines, sectionHeader) {
    const results = [];
    let inSection = false;

    for (const line of lines) {
      const trimmed = line.trimEnd();

      // Detect section start.
      if (trimmed === sectionHeader) {
        inSection = true;
        continue;
      }

      // End section on a new top-level key (no leading whitespace).
      if (inSection && trimmed && !trimmed.startsWith(" ") && !trimmed.startsWith("\t")) {
        break;
      }

      if (!inSection || !trimmed) {
        continue;
      }

      // Parse indented key: value pairs.
      const match = trimmed.match(/^\s+([a-zA-Z0-9_-]+):\s*(.*)/);

      if (match) {
        results.push({
          name: match[1],
          version: match[2] || "*",
        });
      }
    }

    return results;
  }

  /**
   * Parse a TOML section's key-value pairs using simple line parsing.
   *
   * @param {string} raw
   * @param {string} sectionHeader
   * @returns {Array<{name: string, version: string}>}
   */
  parseTomlSection(raw, sectionHeader) {
    const lines = raw.split("\n");
    const results = [];
    let inSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === sectionHeader) {
        inSection = true;
        continue;
      }

      // End section on next section header.
      if (inSection && trimmed.startsWith("[")) {
        break;
      }

      if (!inSection || !trimmed || trimmed.startsWith("#")) {
        continue;
      }

      // Parse name = "version" or name = { version = "..." }.
      const simpleMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);

      if (simpleMatch) {
        results.push({
          name: simpleMatch[1],
          version: simpleMatch[2],
        });
        continue;
      }

      // Table-style: name = { version = "..." }
      const tableMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{.*version\s*=\s*"([^"]+)"/);

      if (tableMatch) {
        results.push({
          name: tableMatch[1],
          version: tableMatch[2],
        });
      }
    }

    return results;
  }

  /**
   * Return an empty dependency result.
   *
   * @returns {{dependencies: Array<{name: string, version: string}>, devDependencies: Array<{name: string, version: string}>, totalCount: number}}
   */
  emptyResult() {
    return {
      dependencies: [],
      devDependencies: [],
      totalCount: 0,
    };
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
      source: "dependencyAnalyzer",
      ...payload,
    });
  }
}

export default new DependencyAnalyzer();
