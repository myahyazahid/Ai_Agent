// src/workspace/workspaceService.js

import eventBus from "../core/eventBus.js";
import workspaceScanner from "./workspaceScanner.js";
import projectAnalyzer from "./projectAnalyzer.js";
import dependencyAnalyzer from "./dependencyAnalyzer.js";
import entryPointDetector from "./entryPointDetector.js";
import workspaceCache from "./workspaceCache.js";

/**
 * @typedef {object} WorkspaceData
 * @property {string | null} framework
 * @property {string | null} language
 * @property {string | null} runtime
 * @property {string | null} packageManager
 * @property {string | null} entryPoint
 * @property {Array<{name: string, version: string}>} dependencies
 * @property {Array<{name: string, version: string}>} devDependencies
 * @property {string[]} configFiles
 * @property {object} workspaceTree
 * @property {{
 *   totalFiles: number,
 *   totalDirectories: number,
 *   detectedLanguages: string[],
 *   largestDirectories: Array<{path: string, fileCount: number}>
 * }} stats
 * @property {string} root
 * @property {string} scannedAt
 */

/**
 * Public API facade for workspace awareness.
 *
 * WorkspaceService is the **single source of truth** for project knowledge.
 * External code should NEVER call scanner, analyzers, or detectors directly.
 *
 * Designed for consumption by:
 *   - CodingAgent (via PromptBuilder/ContextBuilder)
 *   - Future: Planner, GitTool, ContextEngine, RAG, SearchEngine
 *
 * Returns structured data only — knows nothing about LLM prompts.
 */
export class WorkspaceService {
  /**
   * @param {object} [options]
   * @param {string} [options.workspaceRoot]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   * @param {import("./workspaceCache.js").WorkspaceCache} [options.cache]
   * @param {import("./workspaceScanner.js").WorkspaceScanner} [options.scanner]
   * @param {import("./projectAnalyzer.js").ProjectAnalyzer} [options.projectAnalyzer]
   * @param {import("./dependencyAnalyzer.js").DependencyAnalyzer} [options.dependencyAnalyzer]
   * @param {import("./entryPointDetector.js").EntryPointDetector} [options.entryPointDetector]
   */
  constructor({
    workspaceRoot = process.cwd(),
    eventBus: serviceEventBus = eventBus,
    cache = workspaceCache,
    scanner = workspaceScanner,
    projectAnalyzer: analyzer = projectAnalyzer,
    dependencyAnalyzer: depAnalyzer = dependencyAnalyzer,
    entryPointDetector: entryDetector = entryPointDetector,
  } = {}) {
    this.workspaceRoot = workspaceRoot;
    this.eventBus = serviceEventBus;
    this.cache = cache;
    this.scanner = scanner;
    this.projectAnalyzer = analyzer;
    this.dependencyAnalyzer = depAnalyzer;
    this.entryPointDetector = entryDetector;

    /** @type {WorkspaceData | null} */
    this._lastResult = null;
  }

  /**
   * Load workspace data, using cache if available and valid.
   *
   * Orchestrates the full pipeline:
   *   Scanner → ProjectAnalyzer → DependencyAnalyzer → EntryPointDetector → Stats
   *
   * @returns {Promise<WorkspaceData>}
   */
  async load() {
    if (this.cache.isValid()) {
      const cached = this.cache.load();

      if (cached) {
        this.emitStatus("Using cached workspace data", {
          phase: "workspace:cache-hit",
        });

        this._lastResult = /** @type {WorkspaceData} */ (cached);
        return this._lastResult;
      }
    }

    this.emitStatus("Cache expired, scanning workspace", {
      phase: "workspace:cache-miss",
    });

    return this._runPipeline();
  }

  /**
   * Force a full re-scan, ignoring cache.
   *
   * @returns {Promise<WorkspaceData>}
   */
  async refresh() {
    this.cache.invalidate();

    this.emitStatus("Refreshing workspace data", {
      phase: "workspace:cache-refresh",
    });

    return this._runPipeline();
  }

  /**
   * Clear the cache, forcing a re-scan on the next load() call.
   *
   * @returns {void}
   */
  invalidate() {
    this.cache.invalidate();
    this._lastResult = null;
  }

  /**
   * Get the detected framework, or null if not yet loaded.
   *
   * @returns {string | null}
   */
  getFramework() {
    return this._lastResult?.framework ?? null;
  }

  /**
   * Get the detected primary language, or null if not yet loaded.
   *
   * @returns {string | null}
   */
  getLanguage() {
    return this._lastResult?.language ?? null;
  }

  /**
   * Get the detected runtime, or null if not yet loaded.
   *
   * @returns {string | null}
   */
  getRuntime() {
    return this._lastResult?.runtime ?? null;
  }

  /**
   * Get the detected package manager, or null if not yet loaded.
   *
   * @returns {string | null}
   */
  getPackageManager() {
    return this._lastResult?.packageManager ?? null;
  }

  /**
   * Get the dependency lists.
   *
   * @returns {{
   *   dependencies: Array<{name: string, version: string}>,
   *   devDependencies: Array<{name: string, version: string}>
   * }}
   */
  getDependencies() {
    return {
      dependencies: this._lastResult?.dependencies ?? [],
      devDependencies: this._lastResult?.devDependencies ?? [],
    };
  }

  /**
   * Get the detected entry point, or null if not yet loaded.
   *
   * @returns {string | null}
   */
  getEntryPoint() {
    return this._lastResult?.entryPoint ?? null;
  }

  /**
   * Get the workspace tree structure.
   *
   * @returns {object | null}
   */
  getWorkspaceTree() {
    return this._lastResult?.workspaceTree ?? null;
  }

  /**
   * Get workspace statistics.
   *
   * @returns {{
   *   totalFiles: number,
   *   totalDirectories: number,
   *   detectedLanguages: string[],
   *   largestDirectories: Array<{path: string, fileCount: number}>
   * } | null}
   */
  getStats() {
    return this._lastResult?.stats ?? null;
  }

  /**
   * Get the list of detected configuration files.
   *
   * @returns {string[]}
   */
  getConfigFiles() {
    return this._lastResult?.configFiles ?? [];
  }

  /**
   * Get the full workspace data snapshot. Alias for accessing cached results.
   *
   * @returns {WorkspaceData | null}
   */
  getSummary() {
    return this._lastResult;
  }

  /**
   * Find a file by name in the scanned workspace.
   *
   * @param {string} name - File name to search for (e.g., "index.js").
   * @returns {{path: string, relativePath: string, name: string} | null}
   */
  findFile(name) {
    if (!this._lastResult || !this._scanResult) {
      return null;
    }

    return this._scanResult.files.find((f) => f.name === name) ?? null;
  }

  /**
   * Find a directory by name in the scanned workspace.
   *
   * @param {string} name - Directory name to search for (e.g., "src").
   * @returns {{path: string, relativePath: string, name: string} | null}
   */
  findDirectory(name) {
    if (!this._lastResult || !this._scanResult) {
      return null;
    }

    return this._scanResult.directories.find((d) => d.name === name) ?? null;
  }

  /**
   * Run the full analysis pipeline and cache the result.
   *
   * @returns {Promise<WorkspaceData>}
   * @private
   */
  async _runPipeline() {
    // Step 1: Scan
    const scanResult = await this.scanner.scan(this.workspaceRoot);

    // Step 2: Analyze project identity
    const projectInfo = await this.projectAnalyzer.analyze(scanResult);

    // Step 3: Analyze dependencies
    const depInfo = await this.dependencyAnalyzer.analyze(scanResult, projectInfo);

    // Step 4: Detect entry point
    const entryInfo = await this.entryPointDetector.detect(scanResult, projectInfo);

    // Step 5: Build statistics
    const stats = this._buildStats(scanResult);

    // Step 6: Assemble workspace data
    /** @type {WorkspaceData} */
    const workspaceData = {
      framework: projectInfo.framework,
      language: projectInfo.language,
      runtime: projectInfo.runtime,
      packageManager: projectInfo.packageManager,
      entryPoint: entryInfo.entryPoint,
      dependencies: depInfo.dependencies,
      devDependencies: depInfo.devDependencies,
      configFiles: projectInfo.configFiles,
      workspaceTree: scanResult.tree,
      stats,
      root: scanResult.root,
      scannedAt: new Date().toISOString(),
    };

    // Step 7: Cache
    this.cache.save(workspaceData);
    this._lastResult = workspaceData;
    this._scanResult = scanResult;

    this.emitStatus("Workspace ready", {
      phase: "workspace:ready",
      framework: workspaceData.framework,
      language: workspaceData.language,
      entryPoint: workspaceData.entryPoint,
      totalFiles: stats.totalFiles,
      totalDirectories: stats.totalDirectories,
    });

    return workspaceData;
  }

  /**
   * Build workspace statistics from scan results.
   *
   * @param {object} scanResult
   * @param {Array<{language: string | null, relativePath: string}>} scanResult.files
   * @param {Array<{relativePath: string}>} scanResult.directories
   * @returns {{
   *   totalFiles: number,
   *   totalDirectories: number,
   *   detectedLanguages: string[],
   *   largestDirectories: Array<{path: string, fileCount: number}>
   * }}
   * @private
   */
  _buildStats(scanResult) {
    // Detected languages (unique, sorted).
    const languageSet = new Set();

    for (const file of scanResult.files) {
      if (file.language) {
        languageSet.add(file.language);
      }
    }

    const detectedLanguages = Array.from(languageSet).sort();

    // Largest directories by file count.
    /** @type {Map<string, number>} */
    const dirFileCounts = new Map();

    for (const file of scanResult.files) {
      const dir = file.relativePath.includes("/")
        ? file.relativePath.substring(0, file.relativePath.lastIndexOf("/"))
        : ".";

      dirFileCounts.set(dir, (dirFileCounts.get(dir) ?? 0) + 1);
    }

    const largestDirectories = Array.from(dirFileCounts.entries())
      .map(([dirPath, fileCount]) => ({ path: dirPath, fileCount }))
      .sort((a, b) => b.fileCount - a.fileCount)
      .slice(0, 10);

    return {
      totalFiles: scanResult.files.length,
      totalDirectories: scanResult.directories.length,
      detectedLanguages,
      largestDirectories,
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
      source: "workspaceService",
      ...payload,
    });
  }
}

export default new WorkspaceService();
