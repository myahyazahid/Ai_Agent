// src/planner/planGenerator.js

import featurePlacementPlanner from "./featurePlacementPlanner.js";

/**
 * @typedef {object} Goal
 * @property {string} goal - Goal summary description.
 * @property {string} type - Goal classification category.
 * @property {string} successCriteria - Validation criteria of success.
 */

/**
 * @typedef {object} Step
 * @property {string} id - Unique step ID identifier.
 * @property {"read" | "edit" | "tool" | "clarification"} type - Conceptual action type of step.
 * @property {string} target - Target path or scope.
 * @property {string} description - Step description.
 * @property {string[]} dependsOn - Prerequisite step ID array.
 * @property {"retry" | "abort" | "skip"} failureStrategy - Strategy to apply on failure.
 * @property {"pending" | "running" | "completed" | "failed" | "skipped"} status - Active status.
 * @property {string} [role] - Architectural role of the target file.
 * @property {string} [reasoning] - Placement reasoning for traceability.
 */

/**
 * @typedef {object} Plan
 * @property {Goal} goal - Structured Goal criteria object.
 * @property {Step[]} steps - Sorting step array.
 */

/**
 * Generates structured plans for task execution.
 *
 * Uses FeaturePlacementPlanner to resolve the correct target files
 * based on the project's architecture map, instead of hardcoding
 * the entry point as the default target.
 */
export class PlanGenerator {
  /**
   * Generate structured plan.
   *
   * @param {string} requestText - User request text.
   * @param {import("./taskAnalyzer.js").TaskAnalysis} analysis - Analysis details.
   * @param {object | null} [decision] - Strategy decision from DecisionEngine.
   * @param {import("../workspace/workspaceService.js").WorkspaceData | null} [workspaceData] - Full workspace data.
   * @returns {Plan}
   */
  generate(requestText, analysis, decision = null, workspaceData = null) {
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

    const projectStrategy = decision?.projectStrategy || decision?.strategy || "none";
    const authenticationStrategy = decision?.authenticationStrategy || "none";

    // --- Architecture-Aware Target Resolution ---
    // Resolve WHERE the feature should be implemented using FeaturePlacementPlanner.
    // This replaces the previous hardcoded `const entry = "src/index.js"`.
    const placement = featurePlacementPlanner.plan(
      requestText,
      workspaceData?.architectureMap ?? null,
      workspaceData
    );

    const implementTarget = placement.implementationTarget;
    const integrateTarget = placement.integrationTarget; // null if no integration step needed
    const fallbackEntry = workspaceData?.entryPoint ?? "src/index.js";

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
          id: "step_create_module",
          type: "edit",
          target: implementTarget,
          description: `Create dedicated module: ${implementTarget}`,
          role: placement.targetRole,
          reasoning: placement.reasoning,
          dependsOn: ["step_install_express"],
          failureStrategy: "abort",
          status: "pending",
        });

        if (authenticationStrategy === "jwt") {
          steps.push({
            id: "step_install_jwt",
            type: "tool",
            target: "npm install jsonwebtoken",
            description: "Install JWT dependency",
            dependsOn: ["step_create_module"],
            failureStrategy: "retry",
            status: "pending",
          });

          steps.push({
            id: "step_create_auth_middleware",
            type: "edit",
            target: "src/middleware/auth.js",
            description: "Create JWT authentication middleware",
            role: "middleware",
            dependsOn: ["step_install_jwt"],
            failureStrategy: "abort",
            status: "pending",
          });

          if (integrateTarget) {
            steps.push({
              id: "step_integrate_entry",
              type: "edit",
              target: integrateTarget,
              description: `Register module in entry point: import from '${implementTarget}'`,
              role: "entry_point",
              reasoning: "Integration step only — adds import/registration, no feature logic.",
              dependsOn: ["step_create_auth_middleware"],
              failureStrategy: "skip",
              status: "pending",
            });
          }
        } else if (integrateTarget) {
          steps.push({
            id: "step_integrate_entry",
            type: "edit",
            target: integrateTarget,
            description: `Register module in entry point: import from '${implementTarget}'`,
            role: "entry_point",
            reasoning: "Integration step only — adds import/registration, no feature logic.",
            dependsOn: ["step_create_module"],
            failureStrategy: "skip",
            status: "pending",
          });
        }

        steps.push({
          id: "step_verify",
          type: "tool",
          target: `node --check ${implementTarget}`,
          description: `Verify syntax on ${implementTarget}`,
          dependsOn: ["step_create_module"],
          failureStrategy: "skip",
          status: "pending",
        });
      } else {
        // Non-Express strategy: create dedicated module, integrate if needed.
        steps.push({
          id: "step_create_module",
          type: "edit",
          target: implementTarget,
          description: `Create dedicated module: ${implementTarget}`,
          role: placement.targetRole,
          reasoning: placement.reasoning,
          dependsOn: [],
          failureStrategy: "abort",
          status: "pending",
        });

        if (integrateTarget) {
          steps.push({
            id: "step_integrate_entry",
            type: "edit",
            target: integrateTarget,
            description: `Register module in entry point: import from '${implementTarget}'`,
            role: "entry_point",
            reasoning: "Integration step only — adds import/registration, no feature logic.",
            dependsOn: ["step_create_module"],
            failureStrategy: "skip",
            status: "pending",
          });
        }

        steps.push({
          id: "step_verify",
          type: "tool",
          target: `node --check ${implementTarget}`,
          description: `Verify syntax on ${implementTarget}`,
          dependsOn: ["step_create_module"],
          failureStrategy: "skip",
          status: "pending",
        });
      }
    } else if (analysis.category === "refactor" || analysis.category === "bug_fix") {
      // For refactor/bug_fix, read the target file first then apply the fix.
      // Use the placement result as the target (it may have found an existing file).
      const fixTarget = placement.isNewFile ? fallbackEntry : implementTarget;

      steps.push({
        id: "step_read_source",
        type: "read",
        target: fixTarget,
        description: `Read target source file: ${fixTarget}`,
        dependsOn: [],
        failureStrategy: "retry",
        status: "pending",
      });

      steps.push({
        id: "step_apply_fix",
        type: "edit",
        target: fixTarget,
        description: `Apply modifications: ${requestText}`,
        role: placement.targetRole,
        reasoning: placement.reasoning,
        dependsOn: ["step_read_source"],
        failureStrategy: "abort",
        status: "pending",
      });

      steps.push({
        id: "step_verify_syntax",
        type: "tool",
        target: `node --check ${fixTarget}`,
        description: `Run syntax check on modified file: ${fixTarget}`,
        dependsOn: ["step_apply_fix"],
        failureStrategy: "abort",
        status: "pending",
      });
    } else {
      // Generic fallback: use placement result for target.
      steps.push({
        id: "step_default",
        type: "edit",
        target: implementTarget,
        description: `Execute request action: ${requestText}`,
        role: placement.targetRole,
        reasoning: placement.reasoning,
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
