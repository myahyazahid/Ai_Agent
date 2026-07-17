// src/core/contextBuilder.js

/**
 * Maximum tree depth for the compact workspace tree output.
 * @type {number}
 */
const MAX_TREE_DEPTH = 3;

/**
 * Maximum number of lines for the tree output.
 * @type {number}
 */
const MAX_TREE_LINES = 50;

/**
 * Transforms structured AssembledContext from ContextEngine into a
 * token-efficient, LLM-ready context string for prompt injection.
 *
 * Lives in src/core/ alongside PromptBuilder because formatting workspace
 * data for the LLM is a **presentation concern**, not a knowledge concern.
 */
export class ContextBuilder {
  /**
   * Format assembled context into a complete project context block.
   *
   * @param {object | null} assembledContext - Output context from ContextEngine.build().
   * @returns {string}
   */
  format(assembledContext) {
    if (!assembledContext) {
      return "";
    }

    const { workspace, relevantFiles, selectedFiles } = assembledContext;

    if (!workspace) {
      return "";
    }

    const sections = [
      "PROJECT KNOWLEDGE:",
      "(Do not assume or infer any framework, runtime, language, or package manager not explicitly listed here.)",
      "",
      this.formatSummary(workspace),
      "",
      this.formatArchitecture(workspace.architectureMap, workspace.entryPoint),
      "",
      this.formatDependencies(workspace),
      "",
      this.formatRelevantFiles(relevantFiles),
      "",
      this.formatSelectedFiles(selectedFiles),
      "",
      this.formatTree(workspace.workspaceTree),
    ];

    return sections
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Format the project identity summary.
   *
   * @param {object} data
   * @returns {string}
   */
  formatSummary(data) {
    const lines = [
      `Framework: ${data.framework ?? "null"}`,
      `Language: ${data.language ?? "null"}`,
      `Runtime: ${data.runtime ?? "null"}`,
      `Package Manager: ${data.packageManager ?? "null"}`,
      `Entry Point: ${data.entryPoint ?? "null"}`
    ];

    return lines.join("\n");
  }

  /**
   * Format dependencies into a compact list (names only, no versions).
   *
   * @param {object} data
   * @returns {string}
   */
  formatDependencies(data) {
    const lines = [];
    const deps = data.dependencies ?? [];
    const devDeps = data.devDependencies ?? [];

    if (deps.length > 0) {
      const names = deps.map((d) => d.name).join(", ");
      lines.push(`Dependencies: ${names}`);
    }

    if (devDeps.length > 0) {
      const names = devDeps.map((d) => d.name).join(", ");
      lines.push(`Dev Dependencies: ${names}`);
    }

    return lines.join("\n");
  }

  /**
   * Format the architecture map into a structured, LLM-readable block.
   * Each entry shows the directory/file path, its role, purpose, and editing guideline.
   *
   * @param {import("../workspace/architectureAnalyzer.js").ArchitectureMap | null} architectureMap
   * @param {string | null} entryPoint
   * @returns {string}
   */
  formatArchitecture(architectureMap, entryPoint) {
    if (!architectureMap) {
      return "";
    }

    const lines = ["Project Architecture:"];

    // Always render the entry point first with prominent warning
    if (entryPoint) {
      const epMeta = architectureMap.roleIndex?.[entryPoint];
      const meta = architectureMap.files?.find((f) => f.relativePath === entryPoint)?.metadata;
      lines.push(`  Entry Point: ${entryPoint}`);
      lines.push(`    Role: entry_point`);
      if (meta) {
        lines.push(`    Purpose: ${meta.purpose}`);
        lines.push(`    Guideline: ${meta.guideline}`);
      }
      lines.push("");
    }

    // Group remaining files by their directory and emit one line per unique directory role
    const dirRoleIndex = architectureMap.dirRoleIndex ?? {};
    const emittedDirs = new Set();
    if (entryPoint) {
      const epDir = entryPoint.includes("/")
        ? entryPoint.substring(0, entryPoint.lastIndexOf("/"))
        : ".";
      emittedDirs.add(epDir);
    }

    // Collect unique directories that have a known role (not unknown)
    for (const [dir, role] of Object.entries(dirRoleIndex)) {
      if (role === "unknown" || role === "entry_point" || emittedDirs.has(dir)) continue;
      emittedDirs.add(dir);

      // Find one example file to get the metadata
      const exampleFile = architectureMap.files?.find(
        (f) => (f.relativePath.startsWith(dir + "/") || f.relativePath === dir) && f.role === role
      );
      const meta = exampleFile?.metadata;

      lines.push(`  ${dir}/ [${role}]`);
      if (meta) {
        lines.push(`    Purpose: ${meta.purpose}`);
        lines.push(`    Guideline: ${meta.guideline}`);
      }
      lines.push("");
    }

    // Remove trailing empty line
    while (lines[lines.length - 1] === "") lines.pop();

    return lines.join("\n");
  }

  /**
   * Format the top relevant files with their relevance scores.
   *
   * @param {Array<{file: object, score: number}>} relevantFiles
   * @returns {string}
   */
  formatRelevantFiles(relevantFiles) {
    if (!Array.isArray(relevantFiles) || relevantFiles.length === 0) {
      return "Relevant Files: (none detected)";
    }

    const lines = ["Relevant Files (Scored):"];
    for (const entry of relevantFiles.slice(0, 10)) {
      const path = entry.file.relativePath || entry.file.name;
      lines.push(`  - ${path} (Relevance Score: ${entry.score})`);
    }

    return lines.join("\n");
  }

  /**
   * Format the files selected within the token budget.
   *
   * @param {object[]} selectedFiles
   * @returns {string}
   */
  formatSelectedFiles(selectedFiles) {
    if (!Array.isArray(selectedFiles) || selectedFiles.length === 0) {
      return "Selected Files for Active Context: (none selected)";
    }

    const lines = ["Selected Files for Active Context:"];
    for (const file of selectedFiles) {
      const path = file.relativePath || file.name;
      lines.push(`  - ${path}`);
    }

    return lines.join("\n");
  }

  /**
   * Format a workspace tree into a compact, indented text representation.
   *
   * @param {object | null} tree
   * @param {object} [options]
   * @param {number} [options.maxDepth]
   * @param {number} [options.maxLines]
   * @returns {string}
   */
  formatTree(tree, { maxDepth = MAX_TREE_DEPTH, maxLines = MAX_TREE_LINES } = {}) {
    if (!tree) {
      return "";
    }

    const lines = ["Project Structure:"];
    const lineState = { count: 0, truncated: false };

    this._renderTreeNode(tree, 0, maxDepth, maxLines, lines, lineState);

    if (lineState.truncated) {
      lines.push("  ... (truncated)");
    }

    return lines.join("\n");
  }

  /**
   * Recursively render a tree node into indented lines.
   *
   * @param {object} node
   * @param {number} depth
   * @param {number} maxDepth
   * @param {number} maxLines
   * @param {string[]} lines
   * @param {{count: number, truncated: boolean}} lineState
   * @returns {void}
   * @private
   */
  _renderTreeNode(node, depth, maxDepth, maxLines, lines, lineState) {
    if (lineState.count >= maxLines) {
      lineState.truncated = true;
      return;
    }

    if (depth > maxDepth) {
      return;
    }

    const indent = "  ".repeat(depth);
    const isDirectory = node.type === "directory";
    const suffix = isDirectory ? "/" : "";

    // Skip the root node name (depth 0), just render its children.
    if (depth > 0) {
      lines.push(`${indent}${node.name}${suffix}`);
      lineState.count++;
    }

    if (!isDirectory || !Array.isArray(node.children)) {
      return;
    }

    for (const child of node.children) {
      if (lineState.count >= maxLines) {
        lineState.truncated = true;
        return;
      }

      this._renderTreeNode(child, depth + 1, maxDepth, maxLines, lines, lineState);
    }
  }
}

export default new ContextBuilder();
