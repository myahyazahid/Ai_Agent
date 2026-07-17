// src/planner/planCache.js

/**
 * Lightweight in-memory cache to save the last generated execution plan.
 * Supports status, resume, and plan command lookups in the interactive CLI.
 */
export class PlanCache {
  constructor() {
    /** @type {object | null} */
    this._lastPlan = null;
  }

  /**
   * Save a plan.
   *
   * @param {object} plan
   * @returns {void}
   */
  savePlan(plan) {
    this._lastPlan = plan;
  }

  /**
   * Get the last cached plan.
   *
   * @returns {object | null}
   */
  getPlan() {
    return this._lastPlan;
  }

  /**
   * Invalidate/clear the cache.
   *
   * @returns {void}
   */
  clear() {
    this._lastPlan = null;
  }
}

export default new PlanCache();
