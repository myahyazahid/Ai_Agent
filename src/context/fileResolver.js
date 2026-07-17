// src/context/fileResolver.js

import eventBus from "../core/eventBus.js";

/**
 * Resolves ambiguous user references into concrete workspace paths.
 *
 * For example:
 *   "login controller" -> matches files containing both "login" and "controller" in their paths
 *   "auth middleware" -> matches files containing both "auth" and "middleware"
 *
 * Adds resolved files to the candidate list so they are guaranteed to be scored.
 */
export class FileResolver {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({ eventBus: resolverEventBus = eventBus } = {}) {
    this.eventBus = resolverEventBus;
  }

  /**
   * Resolve ambiguous references in the user request to exact workspace files.
   *
   * @param {object[]} candidates - Currently selected candidates list.
   * @param {object} params
   * @param {string} params.request - Original user prompt request.
   * @param {object} params.workspace - WorkspaceData from WorkspaceService.
   * @returns {object[]} Combined list of original candidates and resolved ones.
   */
  resolve(candidates, { request, workspace }) {
    this.emitStatus("Resolving file references", {
      phase: "context:resolving",
    });

    if (!workspace || !Array.isArray(workspace.workspaceTree?.children)) {
      return candidates;
    }

    const allFiles = this.flattenTree(workspace.workspaceTree);
    const normalizedRequest = request.toLowerCase();

    // Identify multi-word concepts in the query (like "auth middleware", "login router")
    const searchPairs = this.extractSearchPairs(normalizedRequest);
    const resolvedFiles = [];

    const existingPaths = new Set(candidates.map((c) => c.relativePath || c.name));

    for (const file of allFiles) {
      const filePathLower = (file.relativePath || "").toLowerCase();

      // Check if any search word pair matches the file path segments
      for (const pair of searchPairs) {
        const matchesAll = pair.every((term) => filePathLower.includes(term));

        if (matchesAll && !existingPaths.has(file.relativePath)) {
          resolvedFiles.push(file);
          existingPaths.add(file.relativePath);
        }
      }
    }

    return [...candidates, ...resolvedFiles];
  }

  /**
   * Extract sets of words that represent ambiguous multi-word concepts.
   * For example, "add an auth middleware" yields:
   *   [["auth", "middleware"], ["middleware"]]
   *
   * @param {string} request
   * @returns {string[][]}
   */
  extractSearchPairs(request) {
    // Split into words, cleaning punctuation
    const words = request
      .replace(/[^a-z0-9\s-_/.]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    const pairs = [];

    // Pair adjacent words
    for (let i = 0; i < words.length - 1; i++) {
      const current = words[i];
      const next = words[i + 1];

      // Exclude simple stopwords from combinations
      if (!this.isStopword(current) && !this.isStopword(next)) {
        pairs.push([current, next]);
      }
    }

    // Also include single strong keywords
    for (const word of words) {
      if (word.length >= 4 && !this.isStopword(word)) {
        pairs.push([word]);
      }
    }

    return pairs;
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
      source: "fileResolver",
      ...payload,
    });
  }
}

export default new FileResolver();
