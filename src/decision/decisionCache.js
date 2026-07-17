// src/decision/decisionCache.js

/**
 * @typedef {object} Decision
 * @property {string} goal - Original request goal.
 * @property {string} projectType - Inspected project type (e.g. CLI, REST API).
 * @property {"clarify" | "reuse_existing_auth" | "create_auth_scratch" | "integrate_nextauth" | "none"} strategy - Selected action strategy.
 * @property {string} reason - Justification for the selected strategy.
 * @property {number} confidence - Strategy selection confidence rating (0.0 to 1.0).
 * @property {string[]} alternatives - Listed alternative actions.
 */

/**
 * Cache for storing the last resolved strategy decision.
 */
export class DecisionCache {
  constructor() {
    /** @type {Decision | null} */
    this.lastDecision = null;
  }

  /**
   * Save a resolved decision.
   *
   * @param {Decision} decision
   * @returns {void}
   */
  saveDecision(decision) {
    this.lastDecision = decision;
  }

  /**
   * Get the last resolved decision.
   *
   * @returns {Decision | null}
   */
  getDecision() {
    return this.lastDecision;
  }
}

export default new DecisionCache();
