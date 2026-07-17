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
  generate(requestText, analysis, decision = null) {
    const goal = {
      goal: requestText,
      type: analysis.category,
      successCriteria: this.resolveSuccessCriteria(analysis.category, requestText),
    };

    const steps = [];

    if (decision?.strategy === "clarify") {
      const question = `${decision.reason} Do you want to: ${decision.alternatives.map((alt, idx) => `\n  ${idx + 1}. ${alt}`).join("")}`;
      steps.push({
        id: "step_clarify",
        type: "clarification",
        target: "user",
        description: decision.reason,
        question,
        dependsOn: [],
        failureStrategy: "abort",
        status: "pending",
      });
      return { goal, steps };
    }

    const entry = "src/index.js";
    const fallbackMode = decision?.strategy === "create_auth_scratch" && decision?.confidence < 0.6;

    if (analysis.category === "feature" || requestText.toLowerCase().includes("auth") || requestText.toLowerCase().includes("login")) {
      if (fallbackMode) {
        steps.push({
          id: "step_read_entry",
          type: "read",
          target: entry,
          description: `Read entrypoint configuration at ${entry}`,
          dependsOn: [],
          failureStrategy: "retry",
          status: "pending",
        });

        steps.push({
          id: "step_create_endpoint",
          type: "edit",
          target: entry,
          description: `Add login route endpoint directly to ${entry}`,
          dependsOn: ["step_read_entry"],
          failureStrategy: "abort",
          status: "pending",
        });

        steps.push({
          id: "step_verify",
          type: "tool",
          target: `node --check ${entry}`,
          description: `Verify server syntax on ${entry}`,
          dependsOn: ["step_create_endpoint"],
          failureStrategy: "skip",
          status: "pending",
        });
      } else if (decision?.strategy === "create_auth_scratch") {
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
          id: "step_read_entry",
          type: "read",
          target: entry,
          description: `Read entrypoint configuration at ${entry}`,
          dependsOn: [],
          failureStrategy: "retry",
          status: "pending",
        });

        steps.push({
          id: "step_create_middleware",
          type: "edit",
          target: "src/middleware/auth.js",
          description: "Create new JWT token authentication middleware at src/middleware/auth.js",
          dependsOn: ["step_install"],
          failureStrategy: "abort",
          status: "pending",
        });

        steps.push({
          id: "step_register_routes",
          type: "edit",
          target: entry,
          description: `Register authorization routes inside entrypoint file ${entry}`,
          dependsOn: ["step_read_entry", "step_create_middleware"],
          failureStrategy: "abort",
          status: "pending",
        });

        steps.push({
          id: "step_verify",
          type: "tool",
          target: `node --check ${entry}`,
          description: `Verify server syntax on ${entry}`,
          dependsOn: ["step_register_routes"],
          failureStrategy: "skip",
          status: "pending",
        });
      } else if (decision?.strategy === "reuse_existing_auth") {
        steps.push({
          id: "step_read_entry",
          type: "read",
          target: entry,
          description: `Read entrypoint configuration at ${entry}`,
          dependsOn: [],
          failureStrategy: "retry",
          status: "pending",
        });

        steps.push({
          id: "step_reuse_auth",
          type: "edit",
          target: entry,
          description: "Reuse existing authentication middleware configurations",
          dependsOn: ["step_read_entry"],
          failureStrategy: "abort",
          status: "pending",
        });

        steps.push({
          id: "step_register_routes",
          type: "edit",
          target: entry,
          description: `Register authorization routes inside entrypoint file ${entry}`,
          dependsOn: ["step_read_entry", "step_reuse_auth"],
          failureStrategy: "abort",
          status: "pending",
        });

        steps.push({
          id: "step_verify",
          type: "tool",
          target: `node --check ${entry}`,
          description: `Verify server syntax on ${entry}`,
          dependsOn: ["step_register_routes"],
          failureStrategy: "skip",
          status: "pending",
        });
      } else if (decision?.strategy === "integrate_nextauth") {
        steps.push({
          id: "step_read_entry",
          type: "read",
          target: entry,
          description: `Read entrypoint configuration at ${entry}`,
          dependsOn: [],
          failureStrategy: "retry",
          status: "pending",
        });

        steps.push({
          id: "step_create_nextauth",
          type: "edit",
          target: "pages/api/auth.js",
          description: "Create NextAuth API configuration route pages/api/auth.js",
          dependsOn: ["step_read_entry"],
          failureStrategy: "abort",
          status: "pending",
        });

        steps.push({
          id: "step_register_routes",
          type: "edit",
          target: entry,
          description: `Register NextAuth middleware options on entrypoint ${entry}`,
          dependsOn: ["step_read_entry", "step_create_nextauth"],
          failureStrategy: "abort",
          status: "pending",
        });

        steps.push({
          id: "step_verify",
          type: "tool",
          target: `node --check ${entry}`,
          description: `Verify server syntax on ${entry}`,
          dependsOn: ["step_register_routes"],
          failureStrategy: "skip",
          status: "pending",
        });
      } else {
        steps.push({
          id: "step_default",
          type: "edit",
          target: entry,
          description: `Execute request action: ${requestText}`,
          dependsOn: [],
          failureStrategy: "abort",
          status: "pending",
        });
      }
    } else if (analysis.category === "refactor" || analysis.category === "bug_fix") {
      steps.push({
        id: "step_read_source",
        type: "read",
        target: entry,
        description: `Read target source file: ${entry}`,
        dependsOn: [],
        failureStrategy: "retry",
        status: "pending",
      });

      steps.push({
        id: "step_apply_fix",
        type: "edit",
        target: entry,
        description: `Apply modifications: ${requestText}`,
        dependsOn: ["step_read_source"],
        failureStrategy: "abort",
        status: "pending",
      });

      steps.push({
        id: "step_verify_syntax",
        type: "tool",
        target: `node --check ${entry}`,
        description: `Run syntax check on modified file: ${entry}`,
        dependsOn: ["step_apply_fix"],
        failureStrategy: "abort",
        status: "pending",
      });
    } else {
      steps.push({
        id: "step_default",
        type: "edit",
        target: entry,
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
