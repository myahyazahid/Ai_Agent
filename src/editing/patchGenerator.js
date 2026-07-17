// src/editing/patchGenerator.js

/**
 * @typedef {object} Patch
 * @property {"CREATE" | "REPLACE_BLOCK" | "INSERT_AFTER" | "INSERT_BEFORE" | "APPEND" | "PREPEND" | "REPLACE_TEXT"} operation
 * @property {{ line: number, text: string } | null} location - Target match location in original file
 * @property {string} insertedCode - Proposed code to insert/add
 * @property {string} removedCode - Code block to remove
 */

/**
 * Generates a canonical Patch object based on the plan.
 */
export class PatchGenerator {
  /**
   * Generate patch.
   *
   * @param {string} originalContent - Original file content.
   * @param {object} plan - EditPlan from EditPlanner.
   * @returns {Patch}
   */
  generate(originalContent, plan) {
    const lines = originalContent ? originalContent.split("\n") : [];
    let location = null;
    let removedCode = "";

    // Identify target line index and build location
    if (plan.targetPattern) {
      let targetIndex = -1;

      if (typeof plan.startLine === "number") {
        targetIndex = plan.startLine - 1;
      } else {
        // Fallback string match
        targetIndex = lines.findIndex((line) => line.includes(plan.targetPattern));
      }

      if (targetIndex !== -1) {
        location = {
          line: targetIndex + 1,
          text: lines[targetIndex],
        };
      }
    }

    // Set removed code block if replacing
    if (plan.strategy === "REPLACE_BLOCK" || plan.strategy === "REPLACE_TEXT") {
      if (typeof plan.startLine === "number" && typeof plan.endLine === "number") {
        removedCode = lines.slice(plan.startLine - 1, plan.endLine).join("\n");
      } else {
        removedCode = plan.targetPattern ?? "";
      }
    }

    return {
      operation: plan.strategy === "CREATE_NEW_FILE" ? "CREATE" : plan.strategy,
      location,
      insertedCode: plan.replacement,
      removedCode,
    };
  }
}

export default new PatchGenerator();
