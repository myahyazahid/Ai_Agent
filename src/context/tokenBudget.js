// src/context/tokenBudget.js

import eventBus from "../core/eventBus.js";

/**
 * Enforces a configurable token budget on the selected context files.
 *
 * Designed to be lightweight in this milestone since file contents are not yet read.
 * We approximate token cost (1 token ≈ 4 bytes/characters of file size) and select
 * the highest scoring files until the budget is filled.
 */
export class TokenBudget {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({ eventBus: budgetEventBus = eventBus } = {}) {
    this.eventBus = budgetEventBus;
  }

  /**
   * Select the highest scoring files within the token budget.
   *
   * @param {Array<{file: object, score: number}>} scoredFiles - Ordered scored files (descending).
   * @param {number} maxTokens - Maximum allowed token limit for the context.
   * @returns {{
   *   selectedFiles: object[],
   *   estimatedTokens: number,
   *   remainingBudget: number
   * }}
   */
  budget(scoredFiles, maxTokens) {
    this.emitStatus("Applying token budget", {
      phase: "context:budget",
      maxTokens,
    });

    const selectedFiles = [];
    let estimatedTokens = 0;

    for (const entry of scoredFiles) {
      // Estimate token cost for the file.
      // Rule of thumb: size in bytes / 4 (assumes standard source code/text density).
      // Baseline cost of 50 tokens for path and metadata mapping.
      const fileSize = typeof entry.file.size === "number" ? entry.file.size : 200;
      const fileTokenEstimate = Math.max(50, Math.ceil(fileSize / 4));

      if (estimatedTokens + fileTokenEstimate <= maxTokens) {
        selectedFiles.push(entry.file);
        estimatedTokens += fileTokenEstimate;
      } else {
        // If the top scored file is too large, skip and check if next file fits,
        // or break. For now, we continue to fit smaller files if possible.
        continue;
      }
    }

    return {
      selectedFiles,
      estimatedTokens,
      remainingBudget: maxTokens - estimatedTokens,
    };
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
      source: "tokenBudget",
      ...payload,
    });
  }
}

export default new TokenBudget();
