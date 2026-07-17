// src/editing/editPlanner.js

/**
 * @typedef {object} EditPlan
 * @property {"CREATE_NEW_FILE" | "REPLACE_BLOCK" | "INSERT_AFTER" | "INSERT_BEFORE" | "APPEND" | "PREPEND" | "REPLACE_TEXT"} strategy
 * @property {string | null} targetPattern - The text pattern in the file used for reference.
 * @property {string} replacement - The code changes to apply.
 * @property {number} [startLine] - Start line of modification (if REPLACE_BLOCK)
 * @property {number} [endLine] - End line of modification
 */

/**
 * Plans the edit operation by choosing the smallest possible edit strategy.
 */
export class EditPlanner {
  /**
   * Plan the edit.
   *
   * @param {string} originalContent - Current content of the file.
   * @param {object} request - The structured request: { text, proposedContent }.
   * @param {object | null} resolvedBlock - Output from EditStrategyResolver.
   * @returns {EditPlan}
   */
  plan(originalContent, request, resolvedBlock) {
    const proposed = request.proposedContent ?? "";
    const requestText = request.text ?? "";
    const query = requestText.toLowerCase();

    // 1. New File Strategy
    if (!originalContent) {
      return {
        strategy: "CREATE_NEW_FILE",
        targetPattern: null,
        replacement: proposed,
      };
    }

    // 2. Resolved Block Strategy (If resolver found a specific function or route)
    if (resolvedBlock && (resolvedBlock.blockType === "function" || resolvedBlock.blockType === "route")) {
      return {
        strategy: "REPLACE_BLOCK",
        targetPattern: resolvedBlock.originalBlock,
        replacement: proposed,
        startLine: resolvedBlock.startLine,
        endLine: resolvedBlock.endLine,
      };
    }

    // Heuristics for placements
    // Check prepend keywords (e.g. "top", "paling atas", "prepend", "beginning", "start")
    if (query.includes("top") || query.includes("paling atas") || query.includes("prepend") || query.includes("beginning") || query.includes("start")) {
      return {
        strategy: "PREPEND",
        targetPattern: null,
        replacement: proposed,
      };
    }

    // Check append keywords (e.g. "bottom", "paling bawah", "append", "end")
    if (query.includes("bottom") || query.includes("paling bawah") || query.includes("append") || query.includes("end")) {
      return {
        strategy: "APPEND",
        targetPattern: null,
        replacement: proposed,
      };
    }

    const lines = originalContent.split("\n");

    // 3. Resolve Import/Export Strategy
    if (resolvedBlock && (resolvedBlock.blockType === "import" || resolvedBlock.blockType === "export")) {
      return {
        strategy: "REPLACE_TEXT",
        targetPattern: resolvedBlock.originalBlock,
        replacement: proposed,
        startLine: resolvedBlock.startLine,
        endLine: resolvedBlock.endLine,
      };
    }

    // 4. Heuristic: Adding imports
    if (query.includes("import") || query.includes("require")) {
      // Find the last import line or default to line 1
      let lastImportIndex = -1;
      const importRegex = /^(?:import\s+|const\s+.*\s*=\s*require\()/i;

      for (let i = 0; i < lines.length; i++) {
        if (importRegex.test(lines[i])) {
          lastImportIndex = i;
        }
      }

      if (lastImportIndex !== -1) {
        return {
          strategy: "INSERT_AFTER",
          targetPattern: lines[lastImportIndex],
          replacement: proposed,
        };
      } else {
        return {
          strategy: "PREPEND",
          targetPattern: null,
          replacement: proposed,
        };
      }
    }

    // 5. Heuristic: Appending to the end of express app or script (default for new routes if unresolved)
    if (query.includes("add") || query.includes("tambahkan")) {
      // If express app, find port listening line e.g., app.listen()
      let listenIndex = -1;
      const listenRegex = /app\.listen\(/;

      for (let i = 0; i < lines.length; i++) {
        if (listenRegex.test(lines[i])) {
          listenIndex = i;
          break;
        }
      }

      if (listenIndex !== -1) {
        // Insert right before app.listen line
        return {
          strategy: "INSERT_BEFORE",
          targetPattern: lines[listenIndex],
          replacement: proposed,
        };
      }
    }

    // Default Fallback: APPEND to end of file (least destructive)
    return {
      strategy: "APPEND",
      targetPattern: null,
      replacement: proposed,
    };
  }
}

export default new EditPlanner();
