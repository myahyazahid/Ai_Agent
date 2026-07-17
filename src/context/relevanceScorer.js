// src/context/relevanceScorer.js

import eventBus from "../core/eventBus.js";

/**
 * Scores candidate files based on multiple heuristics:
 * - Exact filename match
 * - Partial filename similarity / match
 * - Keyword matching in path segments
 * - Directory match boost
 * - Active file & recent reference boost
 * - Baseline boosts for configs and readmes
 */
export class RelevanceScorer {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({ eventBus: scorerEventBus = eventBus } = {}) {
    this.eventBus = scorerEventBus;
  }

  /**
   * Assign a score between 0 and 100 to every candidate.
   *
   * @param {object[]} candidates - Array of candidate file objects.
   * @param {object} params
   * @param {string} params.request - The user query.
   * @param {string | null} params.activeFile - Currently active target file.
   * @param {string[]} params.recentFiles - Recently referenced file paths.
   * @returns {object[]} Ranked array of scored file entries: { file, score }. Sorted descending.
   */
  score(candidates, { request, activeFile, recentFiles }) {
    this.emitStatus("Scoring file relevance", {
      phase: "context:ranking",
    });

    const normalizedRequest = request.toLowerCase();
    const queryWords = this.extractKeywords(normalizedRequest);

    const scored = candidates.map((file) => {
      const score = this.calculateRelevance(file, {
        request: normalizedRequest,
        queryWords,
        activeFile,
        recentFiles,
      });

      return {
        file,
        score: Math.min(100, Math.max(0, score)),
      };
    });

    // Sort by score (descending), then alphabetically by path to ensure deterministic output
    return scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const pathA = a.file.relativePath || a.file.name;
      const pathB = b.file.relativePath || b.file.name;
      return pathA.localeCompare(pathB);
    });
  }

  /**
   * Score a single file.
   *
   * @param {object} file
   * @param {object} params
   * @param {string} params.request
   * @param {string[]} params.queryWords
   * @param {string | null} params.activeFile
   * @param {string[]} params.recentFiles
   * @returns {number}
   */
  calculateRelevance(file, { request, queryWords, activeFile, recentFiles }) {
    let score = 0;

    const pathString = (file.relativePath || file.name).toLowerCase();
    const nameLower = file.name.toLowerCase();

    // 1. Exact Filename Match (e.g. prompt has "auth.js", file is auth.js)
    if (request.includes(nameLower)) {
      score += 40;
    }

    // 2. Partial Match / Directory Match
    const dirSegments = pathString.split("/");
    const filenameNoExt = nameLower.slice(0, nameLower.lastIndexOf(".")) || nameLower;

    // Check if filename without extension is in prompt
    if (filenameNoExt.length >= 3 && request.includes(filenameNoExt)) {
      score += 30;
    }

    // Boost if directory name matches a query word
    for (const segment of dirSegments) {
      if (segment !== nameLower && queryWords.includes(segment)) {
        score += 20;
        break;
      }
    }

    // 3. Keyword Match in Path (15 points per unique keyword matched)
    let keywordMatches = 0;
    for (const word of queryWords) {
      if (pathString.includes(word)) {
        keywordMatches++;
      }
    }
    score += keywordMatches * 15;

    // 4. Active File Boost
    if (activeFile && (file.relativePath === activeFile || file.name === activeFile)) {
      score += 30;
    }

    // 5. Recent Files Boost
    if (Array.isArray(recentFiles) && recentFiles.includes(file.relativePath)) {
      score += 15;
    }

    // 6. Baseline boosts for documentation and configurations
    const isReadme = /readme/i.test(nameLower);
    const isConfig = /package\.json|composer\.json|pubspec\.yaml|cargo\.toml|requirements\.txt|tsconfig\.json/i.test(nameLower);

    if (isConfig) {
      score += 10;
    } else if (isReadme) {
      score += 5;
    }

    return score;
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
      source: "relevanceScorer",
      ...payload,
    });
  }
}

export default new RelevanceScorer();
