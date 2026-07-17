// src/workspace/workspaceCache.js

/**
 * Default cache time-to-live: 5 minutes.
 * @type {number}
 */
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * In-memory cache for workspace analysis results.
 *
 * Designed with a strategy-ready invalidation API so future implementations
 * can switch from time-based to mtime-based or hash-based invalidation
 * without changing the public interface.
 *
 * Current strategy: time-based (TTL).
 * Future strategies: file mtime comparison, content hash comparison.
 */
export class WorkspaceCache {
  /**
   * @param {object} [options]
   * @param {number} [options.maxAgeMs] - Cache TTL in milliseconds.
   */
  constructor({ maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
    /** @type {number} */
    this.maxAgeMs = maxAgeMs;

    /** @type {object | null} */
    this._data = null;

    /** @type {number | null} */
    this._timestamp = null;
  }

  /**
   * Load cached workspace data.
   *
   * @returns {object | null} The cached workspace data, or null if empty.
   */
  load() {
    if (!this._data) {
      return null;
    }

    return this._data;
  }

  /**
   * Save workspace data into the cache with a timestamp.
   *
   * @param {object} data - The workspace data to cache.
   * @returns {void}
   */
  save(data) {
    this._data = data;
    this._timestamp = Date.now();
  }

  /**
   * Check whether the cache contains valid (non-expired) data.
   *
   * This method is the primary extension point for future invalidation
   * strategies. Currently implements time-based TTL checking.
   *
   * Future: accept a strategy parameter or delegate to _checkValidity().
   *
   * @returns {boolean}
   */
  isValid() {
    if (!this._data || this._timestamp === null) {
      return false;
    }

    return this._checkValidity();
  }

  /**
   * Clear all cached data, forcing a re-scan on the next load.
   *
   * @returns {void}
   */
  invalidate() {
    this._data = null;
    this._timestamp = null;
  }

  /**
   * Get cache metadata for diagnostics and debugging.
   *
   * @returns {{
   *   timestamp: number | null,
   *   age: number | null,
   *   isValid: boolean,
   *   hasData: boolean
   * }}
   */
  getMetadata() {
    const age = this._timestamp !== null
      ? Date.now() - this._timestamp
      : null;

    return {
      timestamp: this._timestamp,
      age,
      isValid: this.isValid(),
      hasData: this._data !== null,
    };
  }

  /**
   * Internal validity check. This is the extension point for future
   * invalidation strategies (mtime comparison, content hash, etc.).
   *
   * Current implementation: time-based TTL.
   *
   * @returns {boolean}
   * @protected
   */
  _checkValidity() {
    if (this._timestamp === null) {
      return false;
    }

    const age = Date.now() - this._timestamp;
    return age < this.maxAgeMs;
  }
}

export default new WorkspaceCache();
