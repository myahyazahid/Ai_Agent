// src/planner/planGenerator.js

/**
 * @typedef {object} Goal
 * @property {string} goal - Goal summary description.
 * @property {string} type - Goal classification category.
 * @property {string} successCriteria - Validation criteria of success.
 */

/**
 * @typedef {object} Step
 * @property {string} id - Unique step ID identifier.
 * @property {"read" | "edit" | "tool"} type - Conceptual action type of step.
 * @property {string} target - Target path or scope.
 * @property {string} description - Step description.
 * @property {string[]} dependsOn - Prerequisite step ID array.
 * @property {"retry" | "abort" | "skip"} failureStrategy - Strategy to apply on failure.
 * @property {"pending" | "running" | "completed" | "failed" | "skipped"} status - Active status.
 */

/**
 * @typedef {object} Plan
 * @property {Goal} goal - Structured Goal criteria object.
 * @property {Step[]} steps - Sorting step array.
 */

/**
 * Generates structured plans for task execution.
 */
export class PlanGenerator {
  /**
   * Generate structured plan.
   *
   * @param {string} requestText - User request text.
   * @param {import("./taskAnalyzer.js").TaskAnalysis} analysis - Analysis details.
   * @returns {Plan}
   */
  generate(requestText, analysis) {
    const goal = {
      goal: requestText,
      type: analysis.category,
      successCriteria: this.resolveSuccessCriteria(analysis.category, requestText),
    };

    const steps = [];

    if (analysis.category === "feature" || requestText.toLowerCase().includes("jwt")) {
      // Build a multi-step feature implementation plan
      steps.push({
        id: "step_install",
        type: "tool",
        target: "jsonwebtoken",
        description: "Install dependency jsonwebtoken",
        dependsOn: [],
        failureStrategy: "abort",
        status: "pending",
      });

      steps.push({
        id: "step_read_server",
        type: "read",
        target: "src/server.js",
        description: "Read server configuration to identify middleware hooks",
        dependsOn: [],
        failureStrategy: "retry",
        status: "pending",
      });

      steps.push({
        id: "step_create_middleware",
        type: "edit",
        target: "src/middleware/auth.js",
        description: "Create JWT token verification middleware",
        dependsOn: ["step_install"],
        failureStrategy: "abort",
        status: "pending",
      });

      steps.push({
        id: "step_register_middleware",
        type: "edit",
        target: "src/server.js",
        description: "Register authorization middleware on login endpoint in server.js",
        dependsOn: ["step_read_server", "step_create_middleware"],
        failureStrategy: "abort",
        status: "pending",
      });

      steps.push({
        id: "step_verify",
        type: "tool",
        target: "test auth",
        description: "Validate authentication server setup runs",
        dependsOn: ["step_register_middleware"],
        failureStrategy: "skip",
        status: "pending",
      });
    } else if (analysis.category === "refactor" || analysis.category === "bug_fix") {
      steps.push({
        id: "step_read_source",
        type: "read",
        target: "src/server.js",
        description: "Read target source implementation details",
        dependsOn: [],
        failureStrategy: "retry",
        status: "pending",
      });

      steps.push({
        id: "step_apply_fix",
        type: "edit",
        target: "src/server.js",
        description: `Apply modifications: ${requestText}`,
        dependsOn: ["step_read_source"],
        failureStrategy: "abort",
        status: "pending",
      });

      steps.push({
        id: "step_verify_syntax",
        type: "tool",
        target: "node --check src/server.js",
        description: "Run syntax check on modified files",
        dependsOn: ["step_apply_fix"],
        failureStrategy: "abort",
        status: "pending",
      });
    } else {
      // Default: Simple single step plan
      steps.push({
        id: "step_default",
        type: "edit",
        target: "src/index.js",
        description: `Execute request action: ${requestText}`,
        dependsOn: [],
        failureStrategy: "abort",
        status: "pending",
      });
    }

    return {
      goal,
      steps,
    };
  }

  /**
   * Determine task success criteria.
   *
   * @param {string} category
   * @param {string} requestText
   * @returns {string}
   */
  resolveSuccessCriteria(category, requestText) {
    switch (category) {
      case "feature":
        return "New functional code blocks added and tests execution successful.";
      case "refactor":
        return "Source code optimized, functionality preserved, syntax check passes.";
      case "bug_fix":
        return "Identified fault corrected, files verified syntax valid.";
      case "file_edit":
        return "Minor code segments successfully modified and written.";
      default:
        return "Requested task processed successfully.";
    }
  }
}

export default new PlanGenerator();
