// src/planner/planCache.js

/**
 * Lightweight in-memory cache to save the last generated execution plan.
 * Supports status, resume, and plan command lookups in the interactive CLI.
 */
export class PlanCache {
  constructor() {
    /** @type {object | null} */
    this._lastPlan = null;
    /** @type {object | null} */
    this._rawPlan = null;
  }

  /**
   * Save a plan with progress details.
   *
   * @param {object} plan
   * @param {object} [tracker]
   * @param {object} [decCache]
   * @returns {void}
   */
  savePlan(plan, tracker = null, decCache = null) {
    if (!plan) {
      this._lastPlan = null;
      this._rawPlan = null;
      return;
    }
    this._rawPlan = plan;
    const prog = tracker ? tracker.getProgress() : { currentStep: null, progressPercentage: 0 };
    this._lastPlan = {
      goal: plan.goal?.goal || plan.goal,
      currentStep: prog.currentStep,
      status: tracker ? tracker.status : "Pending",
      decision: decCache ? decCache.getDecision() : null,
      progress: prog.progressPercentage,
    };
  }

  /**
   * Get the last cached plan summary.
   *
   * @returns {object | null}
   */
  getPlan() {
    return this._lastPlan;
  }

  /**
   * Get the raw active plan reference for execution.
   *
   * @returns {object | null}
   */
  getRawPlan() {
    return this._rawPlan;
  }

  /**
   * Invalidate/clear the cache.
   *
   * @returns {void}
   */
  clear() {
    this._lastPlan = null;
    this._rawPlan = null;
  }
}

export default new PlanCache();
