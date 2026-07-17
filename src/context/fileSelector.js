// src/context/fileSelector.js

import eventBus from "../core/eventBus.js";

/**
 * Performs coarse-grained candidate selection from the workspace.
 *
 * Uses fast deterministic heuristics:
 * - Keyword matching against file names & extensions
 * - Documentation files (README)
 * - Main config files (package.json, composer.json, etc.)
 * - Active file & recently referenced files
 */
export class FileSelector {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({ eventBus: selectorEventBus = eventBus } = {}) {
    this.eventBus = selectorEventBus;
  }

  /**
   * Select a set of candidate files from workspace data.
   *
   * @param {object} params
   * @param {string} params.request - The user prompt query.
   * @param {object} params.workspace - WorkspaceData from WorkspaceService.
   * @param {string | null} params.activeFile - Currently active/open file path.
   * @param {string[]} params.recentFiles - List of recently touched files.
   * @returns {object[]} Selected candidate file entries.
   */
  select({ request, workspace, activeFile, recentFiles }) {
    this.emitStatus("Selecting files", {
      phase: "context:selecting-files",
    });

    if (!workspace || !Array.isArray(workspace.workspaceTree?.children)) {
      return [];
    }

    const allFiles = this.flattenTree(workspace.workspaceTree);
    const keywords = this.extractKeywords(request);

    /** @type {Set<string>} */
    const selectedPaths = new Set();
    const candidates = [];

    // Helper to add unique candidates
    const addCandidate = (file) => {
      const normalizedPath = file.relativePath || file.name;
      if (!selectedPaths.has(normalizedPath)) {
        selectedPaths.add(normalizedPath);
        candidates.push(file);
      }
    };

    // 1. Active File (if any)
    if (activeFile) {
      const activeEntry = allFiles.find(
        (f) => f.relativePath === activeFile || f.name === activeFile
      );
      if (activeEntry) {
        addCandidate(activeEntry);
      }
    }

    // 2. Recent Files
    for (const recentPath of recentFiles || []) {
      const recentEntry = allFiles.find(
        (f) => f.relativePath === recentPath || f.name === recentPath
      );
      if (recentEntry) {
        addCandidate(recentEntry);
      }
    }

    // 3. Documentation (README.md, readme.txt, etc.)
    const docFiles = allFiles.filter((f) =>
      /readme\.(md|txt)$/i.test(f.name)
    );
    for (const doc of docFiles) {
      addCandidate(doc);
    }

    // 4. Configuration files (package.json, config files list from project metadata)
    const configNames = new Set(workspace.configFiles || []);
    const configFiles = allFiles.filter((f) => configNames.has(f.name));
    for (const cfg of configFiles) {
      addCandidate(cfg);
    }

    // 5. Keyword Matches in Path/Extension/Directory
    for (const file of allFiles) {
      const filePathLower = (file.relativePath || "").toLowerCase();
      const fileNameLower = file.name.toLowerCase();

      // Check filename or path contains any query keywords
      const matchesKeyword = keywords.some((word) =>
        filePathLower.includes(word)
      );

      if (matchesKeyword) {
        addCandidate(file);
      }
    }

    return candidates;
  }

  /**
   * Recursively flatten the nested tree into a list of file entries.
   *
   * @param {object} node
   * @param {string} [parentPath]
   * @returns {object[]}
   */
  flattenTree(node, parentPath = "", isRoot = true) {
    if (!node) {
      return [];
    }

    let currentPath = parentPath;
    if (!isRoot) {
      currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    }

    if (node.type === "file") {
      return [{
        name: node.name,
        relativePath: currentPath,
        extension: this.extractExtension(node.name),
      }];
    }

    const results = [];
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        results.push(...this.flattenTree(child, currentPath, false));
      }
    }

    return results;
  }

  /**
   * Extract alphanumeric search keywords from prompt.
   *
   * @param {string} text
   * @returns {string[]}
   */
  extractKeywords(text) {
    if (!text) {
      return [];
    }

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-_/.]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !this.isStopword(word));
  }

  /**
   * Simple stopword filter.
   *
   * @param {string} word
   * @returns {boolean}
   */
  isStopword(word) {
    const stopwords = new Set([
      "the", "and", "for", "how", "what", "with", "from", "this",
      "that", "here", "there", "when", "where", "please", "should",
      "would", "could", "about", "your", "project", "code", "file",
      "folder", "directory", "implementation", "implemented", "api",
    ]);

    return stopwords.has(word);
  }

  /**
   * Extract extension with leading dot.
   *
   * @param {string} name
   * @returns {string | null}
   */
  extractExtension(name) {
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex <= 0 || dotIndex === name.length - 1) {
      return null;
    }
    return name.slice(dotIndex).toLowerCase();
  }

  /**
   * Emit a status update.
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
      source: "fileSelector",
      ...payload,
    });
  }
}

export default new FileSelector();
