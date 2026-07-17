// src/editing/editStrategyResolver.js

/**
 * @typedef {object} ResolvedBlock
 * @property {"function" | "route" | "import" | "export" | "generic"} blockType
 * @property {string} name
 * @property {string} originalBlock
 * @property {number} startLine - 1-indexed start line
 * @property {number} endLine - 1-indexed end line
 */

/**
 * Resolves which route, function, import, or export block in the target file
 * the user request is targeting.
 *
 * Scans the file contents using regex heuristics.
 */
export class EditStrategyResolver {
  /**
   * Resolve targets in code from user request.
   *
   * @param {string} originalContent - Current content of the file.
   * @param {string} requestText - Description of the change requested.
   * @returns {ResolvedBlock | null} Resolved block info or null if generic/not found.
   */
  resolve(originalContent, requestText) {
    if (!originalContent || !requestText) {
      return null;
    }

    const query = requestText.toLowerCase();

    // 1. Resolve Route (e.g. "login endpoint", "auth route")
    const routeMatch = query.match(/(?:endpoint|route|path)\s+['"]?\/?([a-zA-Z0-9_-]+)['"]?/i) 
      || query.match(/['"]?\/?([a-zA-Z0-9_-]+)['"]?\s+(?:endpoint|route|path)/i);

    if (routeMatch) {
      const routeName = routeMatch[1];
      const routeRegex = new RegExp(
        `(?:app|router|server)\\.(?:get|post|put|delete|use|patch)\\(\\s*['"]\\/${routeName}['"]`,
        "i"
      );
      const blockInfo = this.findRegexBlock(originalContent, routeRegex, "route", routeName);
      if (blockInfo) return blockInfo;
    }

    // 2. Resolve Function (e.g. "login function", "authenticate function")
    const functionMatch = query.match(/(?:function|method)\s+([a-zA-Z0-9_-]+)\b/i)
      || query.match(/\b([a-zA-Z0-9_-]+)\s+(?:function|method)/i);

    if (functionMatch) {
      const funcName = functionMatch[1];
      // Match function declarations, arrow functions, and method properties.
      const funcRegex = new RegExp(
        `(?:function\\s+${funcName}\\b|const\\s+${funcName}\\s*=\\s*(?:async\\s*)?\\(|(?:async\\s*)?${funcName}\\s*\\([^)]*\\)\\s*\\{)`,
        "i"
      );
      const blockInfo = this.findRegexBlock(originalContent, funcRegex, "function", funcName);
      if (blockInfo) return blockInfo;
    }

    // 3. Resolve Import (e.g. "import axios", "require express")
    const importMatch = query.match(/(?:import|require|package)\s+([a-zA-Z0-9_-]+)\b/i)
      || query.match(/\b([a-zA-Z0-9_-]+)\s+(?:import|require)/i);

    if (importMatch) {
      const packageName = importMatch[1];
      const importRegex = new RegExp(
        `(?:import\\s+.*\\b${packageName}\\b|const\\s+.*\\b${packageName}\\b\\s*=\\s*require\\()`,
        "i"
      );
      const lines = originalContent.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (importRegex.test(lines[i])) {
          return {
            blockType: "import",
            name: packageName,
            originalBlock: lines[i],
            startLine: i + 1,
            endLine: i + 1,
          };
        }
      }
    }

    // 4. Resolve Export (e.g. "export codingAgent", "module.exports")
    const exportMatch = query.match(/(?:export|module\.exports)\s+([a-zA-Z0-9_-]+)\b/i);
    if (exportMatch) {
      const exportName = exportMatch[1];
      const exportRegex = new RegExp(
        `(?:export\\s+(?:default\\s+)?${exportName}\\b|exports\\.${exportName}\\s*=|module\\.exports\\s*=)`,
        "i"
      );
      const lines = originalContent.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (exportRegex.test(lines[i])) {
          return {
            blockType: "export",
            name: exportName,
            originalBlock: lines[i],
            startLine: i + 1,
            endLine: i + 1,
          };
        }
      }
    }

    return null;
  }

  /**
   * Find a code block matching a start pattern and balancing curly braces.
   *
   * @param {string} content
   * @param {RegExp} regex
   * @param {"function" | "route"} type
   * @param {string} name
   * @returns {ResolvedBlock | null}
   */
  findRegexBlock(content, regex, type, name) {
    const lines = content.split("\n");
    let startLine = -1;

    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        startLine = i;
        break;
      }
    }

    if (startLine === -1) {
      return null;
    }

    // Find the end of the block by balancing curly braces
    let braceCount = 0;
    let foundOpenBrace = false;
    let endLine = startLine;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        const char = line[charIndex];
        if (char === "{") {
          braceCount++;
          foundOpenBrace = true;
        } else if (char === "}") {
          braceCount--;
        }
      }

      if (foundOpenBrace && braceCount === 0) {
        endLine = i;
        break;
      }
    }

    // If curly brace matching fails, fall back to matching the start line only
    if (!foundOpenBrace) {
      endLine = startLine;
    }

    const blockLines = lines.slice(startLine, endLine + 1);

    return {
      blockType: type,
      name,
      originalBlock: blockLines.join("\n"),
      startLine: startLine + 1,
      endLine: endLine + 1,
    };
  }
}

export default new EditStrategyResolver();
