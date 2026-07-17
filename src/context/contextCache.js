// src/context/contextCache.js

import eventBus from "../core/eventBus.js";

/**
 * Lightweight in-memory cache for context engine results.
 *
 * Prevents rebuilding context on consecutive queries targeting the same area.
 * Cache matches on signature built from the user request text and active file path.
 */
export class ContextCache {
  /**
   * @param {object} [options]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({ eventBus: cacheEventBus = eventBus } = {}) {
    this.eventBus = cacheEventBus;

    /** @type {Map<string, object>} */
    this._cache = new Map();
  }

  /**
   * Load cached context if signature matches.
   *
   * @param {string} signature - Unique signature of the request and context state.
   * @returns {object | null}
   */
  load(signature) {
    const cached = this._cache.get(signature);

    if (cached) {
      this.emitStatus("Using cached context", {
        phase: "context:cache-hit",
        signature,
      });

      return cached;
    }

    return null;
  }

  /**
   * Save context result to cache.
   *
   * @param {string} signature
   * @param {object} data
   * @returns {void}
   */
  save(signature, data) {
    this._cache.set(signature, data);
  }

  /**
   * Invalidate all cached contexts.
   *
   * @returns {void}
   */
  invalidate() {
    this._cache.clear();
  }

  /**
   * Generate a stable string signature for the context input.
   *
   * @param {object} params
   * @param {string} params.request
   * @param {string | null} params.activeFile
   * @param {string[]} params.recentFiles
   * @returns {string}
   */
  generateSignature({ request, activeFile, recentFiles }) {
    const active = activeFile ?? "";
    const recent = (recentFiles ?? []).join(",");
    const normalizedRequest = request.trim().toLowerCase();

    return `${normalizedRequest}|active:${active}|recent:${recent}`;
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
      source: "contextCache",
      ...payload,
    });
  }
}

export default new ContextCache();
