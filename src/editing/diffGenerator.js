// src/editing/diffGenerator.js

/**
 * Constructs a readable, colorized diff directly from the canonical Patch object.
 *
 * This ensures the Patch remains the single source of truth for the change.
 */
export class DiffGenerator {
  /**
   * Generate colored diff string from Patch.
   *
   * @param {object} patch - Canonical Patch object.
   * @returns {string} Colored diff block.
   */
  generate(patch) {
    const lines = [];

    // Prefix for colors
    const red = "\x1b[31m";
    const green = "\x1b[32m";
    const yellow = "\x1b[33m";
    const reset = "\x1b[0m";

    lines.push(`Diff Operation: ${yellow}${patch.operation}${reset}`);

    if (patch.location) {
      lines.push(`Location: Line ${patch.location.line}: "${patch.location.text.trim()}"`);
    }

    lines.push("─".repeat(40));

    if (patch.operation === "CREATE" || patch.operation === "APPEND" || patch.operation === "PREPEND") {
      // Just additions
      const addedLines = patch.insertedCode.split("\n");
      for (const line of addedLines) {
        lines.push(`${green}+ ${line}${reset}`);
      }
    } else if (patch.operation === "INSERT_AFTER" || patch.operation === "INSERT_BEFORE") {
      // Show reference line, then addition
      if (patch.operation === "INSERT_BEFORE") {
        const addedLines = patch.insertedCode.split("\n");
        for (const line of addedLines) {
          lines.push(`${green}+ ${line}${reset}`);
        }
        if (patch.location) {
          lines.push(`  ${patch.location.text}`);
        }
      } else {
        if (patch.location) {
          lines.push(`  ${patch.location.text}`);
        }
        const addedLines = patch.insertedCode.split("\n");
        for (const line of addedLines) {
          lines.push(`${green}+ ${line}${reset}`);
        }
      }
    } else if (patch.operation === "REPLACE_BLOCK" || patch.operation === "REPLACE_TEXT") {
      // Show removals then additions
      const removedLines = patch.removedCode ? patch.removedCode.split("\n") : [];
      const addedLines = patch.insertedCode.split("\n");

      for (const line of removedLines) {
        lines.push(`${red}- ${line}${reset}`);
      }
      for (const line of addedLines) {
        lines.push(`${green}+ ${line}${reset}`);
      }
    }

    lines.push("─".repeat(40));

    return lines.join("\n");
  }
}

export default new DiffGenerator();
