// src/editing/editValidator.js

/**
 * Validates the updated file content against syntax and design constraints.
 * Aborts modifications if errors are encountered.
 */
export class EditValidator {
  /**
   * Validate content.
   *
   * @param {string} content - The proposed/updated file content.
   * @param {string} filePath - Path of the target file.
   * @param {string} [originalContent] - Content of the file before edits.
   * @returns {{
   *   valid: boolean,
   *   warnings: string[],
   *   errors: string[]
   * }}
   */
  validate(content, filePath, originalContent = "") {
    const warnings = [];
    const errors = [];

    // 1. Empty File Protection
    if (!content.trim() && originalContent.trim()) {
      errors.push("Empty file protection triggered: Entire file content was cleared.");
    }

    // 2. JSON Validation
    if (filePath.endsWith(".json")) {
      try {
        JSON.parse(content);
      } catch (err) {
        errors.push(`Malformed JSON syntax: ${err instanceof Error ? err.message : "Parsing failed"}`);
      }
      return {
        valid: errors.length === 0,
        warnings,
        errors,
      };
    }

    // 3. Balanced Brackets & Unclosed Strings
    this.checkBracketsAndStrings(content, errors);

    // 4. Duplicate Checks (imports, routes, functions, exports)
    this.checkDuplicates(content, warnings, errors);

    return {
      valid: errors.length === 0,
      warnings,
      errors,
    };
  }

  /**
   * Balanced brackets depth-stack check (skipping template literals, string literals, and regexes).
   * Also verifies unclosed string literals.
   *
   * @param {string} code
   * @param {string[]} errors
   * @returns {void}
   */
  checkBracketsAndStrings(code, errors) {
    const stack = [];
    const pairs = {
      "}": "{",
      "]": "[",
      ")": "(",
    };

    let inString = false;
    let stringChar = "";
    let escapeNext = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        if (inString) {
          escapeNext = true;
        }
        continue;
      }

      // Handle string literals
      if (char === '"' || char === "'" || char === "`") {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = "";
        }
        continue;
      }

      if (inString) {
        continue;
      }

      // Check brackets
      if (char === "{" || char === "[" || char === "(") {
        stack.push({ char, line: this.getLineNumber(code, i) });
      } else if (char === "}" || char === "]" || char === ")") {
        const top = stack.pop();
        if (!top || top.char !== pairs[char]) {
          errors.push(`Unbalanced bracket matched: found '${char}' at line ${this.getLineNumber(code, i)} with no matching '${pairs[char]}'`);
          return;
        }
      }
    }

    if (inString) {
      errors.push(`Unclosed string literal: reached end of file while parsing string with delimiter '${stringChar}'`);
    }

    if (stack.length > 0) {
      const top = stack.pop();
      errors.push(`Unbalanced bracket matched: unclosed '${top.char}' opened at line ${top.line}`);
    }
  }

  /**
   * Search for duplicate imports, routes, functions, and exports.
   *
   * @param {string} code
   * @param {string[]} warnings
   * @param {string[]} errors
   * @returns {void}
   */
  checkDuplicates(code, warnings, errors) {
    const lines = code.split("\n");

    const imports = new Set();
    const routes = new Set();
    const functions = new Set();
    const exportsSet = new Set();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // 1. Duplicate Imports
      const importMatch = line.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/i)
        || line.match(/require\(\s*['"]([^'"]+)['"]\s*\)/i);

      if (importMatch) {
        const packageName = importMatch[1];
        if (imports.has(packageName)) {
          warnings.push(`Duplicate package import identified: '${packageName}' at line ${lineNum}`);
        } else {
          imports.add(packageName);
        }
      }

      // 2. Duplicate Routes
      const routeMatch = line.match(/(?:app|router|server)\.(get|post|put|delete|use|patch)\(\s*['"]([^'"]+)['"]/i);
      if (routeMatch) {
        const methodPath = `${routeMatch[1].toUpperCase()}:${routeMatch[2]}`;
        if (routes.has(methodPath)) {
          errors.push(`Duplicate route handler declared: '${methodPath}' at line ${lineNum}`);
        } else {
          routes.add(methodPath);
        }
      }

      // 3. Duplicate Functions
      const funcMatch = line.match(/^function\s+([a-zA-Z0-9_-]+)\b/i)
        || line.match(/^const\s+([a-zA-Z0-9_-]+)\s*=\s*(?:async\s*)?\(/i);

      if (funcMatch) {
        const funcName = funcMatch[1];
        if (functions.has(funcName)) {
          errors.push(`Duplicate function name matched: '${funcName}' at line ${lineNum}`);
        } else {
          functions.add(funcName);
        }
      }

      // 4. Duplicate Exports
      const exportMatch = line.match(/^export\s+(?:default\s+)?(?:const|let|var|function|class)\s+([a-zA-Z0-9_-]+)\b/i)
        || line.match(/^exports\.([a-zA-Z0-9_-]+)\s*=/i);

      if (exportMatch) {
        const exportName = exportMatch[1];
        if (exportsSet.has(exportName)) {
          errors.push(`Duplicate export declared: '${exportName}' at line ${lineNum}`);
        } else {
          exportsSet.add(exportName);
        }
      }
    }
  }

  /**
   * Helper to count newlines and resolve index line number.
   *
   * @param {string} text
   * @param {number} index
   * @returns {number}
   */
  getLineNumber(text, index) {
    return text.substring(0, index).split("\n").length;
  }
}

export default new EditValidator();
