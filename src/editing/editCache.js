// src/editing/editCache.js

/**
 * Lightweight in-memory cache for debugging.
 * Stores the last successful edit execution result.
 */
export class EditCache {
  constructor() {
    /** @type {object | null} */
    this._lastEdit = null;
  }

  /**
   * Cache the last edit result.
   *
   * @param {object} editResult
   * @returns {void}
   */
  saveLastEdit(editResult) {
    this._lastEdit = editResult;
  }

  /**
   * Get the last cached edit result.
   *
   * @returns {object | null}
   */
  getLastEdit() {
    return this._lastEdit;
  }

  /**
   * Clear the cached edit result.
   *
   * @returns {void}
   */
  invalidate() {
    this._lastEdit = null;
  }
}

export default new EditCache();
