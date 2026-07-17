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
    const projectStrategy = decision?.projectStrategy || decision?.strategy || "none";
    const authenticationStrategy = decision?.authenticationStrategy || "none";
    const fallbackMode = projectStrategy === "express" && decision?.confidence < 0.6;

    if (analysis.category === "feature" || requestText.toLowerCase().includes("auth") || requestText.toLowerCase().includes("login")) {
      if (projectStrategy === "express") {
        steps.push({
          id: "step_install_express",
          type: "tool",
          target: "npm install express",
          description: "Install Express framework",
          dependsOn: [],
          failureStrategy: "retry",
          status: "pending",
        });

        steps.push({
          id: "step_create_express_app",
          type: "edit",
          target: entry,
          description: "Create an Express application entrypoint",
          dependsOn: ["step_install_express"],
          failureStrategy: "abort",
          status: "pending",
        });

        steps.push({
          id: "step_create_login_route",
          type: "edit",
          target: entry,
          description: "Create a login endpoint inside the Express app",
          dependsOn: ["step_create_express_app"],
          failureStrategy: "abort",
          status: "pending",
        });

        if (authenticationStrategy === "jwt") {
          steps.push({
            id: "step_install_jwt",
            type: "tool",
            target: "npm install jsonwebtoken",
            description: "Install JWT dependency",
            dependsOn: ["step_create_login_route"],
            failureStrategy: "retry",
            status: "pending",
          });

          steps.push({
            id: "step_create_auth_middleware",
            type: "edit",
            target: "src/middleware/auth.js",
            description: "Create JWT authentication middleware",
            dependsOn: ["step_install_jwt"],
            failureStrategy: "abort",
            status: "pending",
          });

          steps.push({
            id: "step_generate_token",
            type: "edit",
            target: entry,
            description: "Generate JWT tokens for the login flow",
            dependsOn: ["step_create_auth_middleware"],
            failureStrategy: "abort",
            status: "pending",
          });
        }

        steps.push({
          id: "step_verify",
          type: "tool",
          target: `node --check ${entry}`,
          description: `Verify server syntax on ${entry}`,
          dependsOn: ["step_create_login_route"],
          failureStrategy: "skip",
          status: "pending",
        });
      } else if (fallbackMode) {
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
