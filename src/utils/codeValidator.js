// src/utils/codeValidator.js

/**
 * @typedef {object} ValidationResult
 * @property {boolean} valid        - Whether the code passes all checks.
 * @property {string[]} violations  - Descriptions of each constraint violation found.
 * @property {string} [suggestion]  - A short corrective instruction for the LLM.
 */

/**
 * ESM patterns that must not appear in CJS code.
 * @type {Array<{ pattern: RegExp, label: string }>}
 */
const ESM_PATTERNS = [
  { pattern: /\brequire\s*\(/m, label: "require() — use import ... from '...' instead" },
  { pattern: /\bmodule\.exports\s*=/m, label: "module.exports = — use export default or named exports instead" },
  { pattern: /\bexports\.\w+\s*=/m, label: "exports.x = — use named export syntax instead" },
];

/**
 * CJS patterns that must not appear in ESM code.
 * @type {Array<{ pattern: RegExp, label: string }>}
 */
const CJS_PATTERNS = [
  {
    // Match top-level `import` declarations but not inside strings or comments.
    // Simple heuristic: starts of a line with import keyword.
    pattern: /^import\s+/m,
    label: "import ... from — use require() instead",
  },
  {
    pattern: /^export\s+(default|const|function|class|let|var|\{)/m,
    label: "export ... — use module.exports = or exports.x = instead",
  },
];

/**
 * File extensions considered JavaScript/TypeScript source files.
 * Validation only applies to these.
 *
 * @type {Set<string>}
 */
const JS_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);

/**
 * Check whether a file path is a JavaScript or TypeScript source file.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function isJsFile(filePath) {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  return JS_EXTENSIONS.has(ext);
}

/**
 * Validate that generated code content follows the detected module system.
 *
 * @param {string} content       - The generated code to validate.
 * @param {"esm" | "commonjs" | null} moduleSystem - Detected project module system.
 * @param {string} filePath      - Target file path (used to restrict to JS/TS files).
 * @returns {ValidationResult}
 */
export function validateModuleSystem(content, moduleSystem, filePath) {
  // Only validate JS/TS source files.
  if (!isJsFile(filePath)) {
    return { valid: true, violations: [] };
  }

  // Cannot validate if module system is unknown.
  if (!moduleSystem) {
    return { valid: true, violations: [] };
  }

  const violations = [];
  const patternsToCheck = moduleSystem === "esm" ? ESM_PATTERNS : CJS_PATTERNS;

  for (const { pattern, label } of patternsToCheck) {
    if (pattern.test(content)) {
      violations.push(label);
    }
  }

  if (violations.length === 0) {
    return { valid: true, violations: [] };
  }

  const systemLabel = moduleSystem === "esm" ? "ES Module (ESM)" : "CommonJS (CJS)";
  const suggestion =
    moduleSystem === "esm"
      ? "Rewrite the code using import/export syntax. Replace require() with import statements. Add .js extension to all local import paths."
      : "Rewrite the code using require() and module.exports. Remove all import/export keywords.";

  return {
    valid: false,
    violations,
    suggestion: `This project uses ${systemLabel}. ${suggestion}`,
  };
}
