// src/planner/progressTracker.js

/**
 * @typedef {object} StepResult
 * @property {"success" | "failed"} status
 * @property {number} duration - execution duration in ms
 * @property {string[]} filesChanged
 * @property {string} toolUsed
 * @property {string} output
 */

/**
 * Tracks execution state and results for plan steps.
 */
export class ProgressTracker {
  constructor() {
    /** @type {object | null} */
    this.plan = null;
    /** @type {Record<string, StepResult>} */
    this.results = {};
    /** @type {"Pending" | "Executing" | "WaitingForUser" | "WaitingForManualAction" | "Completed" | "Failed"} */
    this.status = "Pending";
  }

  /**
   * Initialize progress tracking for a plan.
   *
   * @param {object} plan
   * @returns {void}
   */
  init(plan) {
    this.plan = plan;
    this.results = {};
    this.status = "Pending";
    if (this.plan && Array.isArray(this.plan.steps)) {
      for (const step of this.plan.steps) {
        step.status = "pending";
      }
    }
  }

  /**
   * Set plan steps to running.
   *
   * @param {string} stepId
   * @returns {void}
   */
  markStepRunning(stepId) {
    const step = this.findStep(stepId);
    if (step) {
      step.status = "running";
      this.status = "Executing";
    }
  }

  /**
   * Complete a step and store its result.
   *
   * @param {string} stepId
   * @param {StepResult} result
   * @returns {void}
   */
  markStepCompleted(stepId, result) {
    const step = this.findStep(stepId);
    if (step) {
      step.status = "completed";
      this.results[stepId] = result;
    }
  }

  /**
   * Record a failed step.
   *
   * @param {string} stepId
   * @param {StepResult} result
   * @returns {void}
   */
  markStepFailed(stepId, result) {
    const step = this.findStep(stepId);
    if (step) {
      step.status = "failed";
      this.results[stepId] = result;
      this.status = "Failed";
    }
  }

  /**
   * Mark a step as skipped.
   *
   * @param {string} stepId
   * @returns {void}
   */
  markStepSkipped(stepId) {
    const step = this.findStep(stepId);
    if (step) {
      step.status = "skipped";
    }
  }

  /**
   * Get progress details.
   *
   * @returns {{
   *   currentStep: object | null,
   *   completedSteps: object[],
   *   failedSteps: object[],
   *   remainingSteps: object[],
   *   progressPercentage: number
   * }}
   */
  getProgress() {
    if (!this.plan || !Array.isArray(this.plan.steps)) {
      return {
        currentStep: null,
        completedSteps: [],
        failedSteps: [],
        remainingSteps: [],
        progressPercentage: 0,
      };
    }

    const steps = this.plan.steps;
    const completedSteps = steps.filter((s) => s.status === "completed" || s.status === "skipped");
    const failedSteps = steps.filter((s) => s.status === "failed");
    const remainingSteps = steps.filter((s) => s.status === "pending" || s.status === "running");

    const currentStep = steps.find((s) => s.status === "running" || s.status === "failed") || null;
    const progressPercentage = Math.round((completedSteps.length / steps.length) * 100);

    return {
      currentStep,
      completedSteps,
      failedSteps,
      remainingSteps,
      progressPercentage,
    };
  }

  /**
   * Resume failed plan steps by resetting failed steps to pending.
   *
   * @returns {void}
   */
  resume() {
    if (!this.plan || !Array.isArray(this.plan.steps)) {
      return;
    }

    for (const step of this.plan.steps) {
      if (step.status === "failed") {
        step.status = "pending";
      }
    }
  }

  /**
   * Find a step by ID.
   *
   * @param {string} stepId
   * @returns {object | null}
   * @private
   */
  findStep(stepId) {
    if (!this.plan || !Array.isArray(this.plan.steps)) {
      return null;
    }
    return this.plan.steps.find((s) => s.id === stepId) || null;
  }
}

export default new ProgressTracker();
