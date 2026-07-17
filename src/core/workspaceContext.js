import path from "node:path";

/**
 * Builds lightweight workspace context for the model so tool arguments stay
 * aligned with the active work area and recently referenced files.
 */
export class WorkspaceContext {
  /**
   * @param {object} [options]
   * @param {string} [options.workspaceRoot]
   */
  constructor({ workspaceRoot = process.cwd() } = {}) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Create prompt-ready workspace context from the current input and history.
   *
   * @param {object} params
   * @param {string} params.userInput
   * @param {Array<{role: string, content: string}>} [params.history]
   * @returns {{
   *   workspaceRoot: string,
   *   currentWorkingDirectory: string,
   *   currentTargetFile: string | null
   * }}
   */
  build({ userInput, history = [] }) {
    const currentTargetFile = this.findCurrentTargetFile(userInput, history);
    const currentWorkingDirectory = currentTargetFile
      ? this.toWorkspaceRelative(path.dirname(currentTargetFile))
      : ".";

    return {
      workspaceRoot: this.workspaceRoot,
      currentWorkingDirectory,
      currentTargetFile: currentTargetFile
        ? this.toWorkspaceRelative(currentTargetFile)
        : null,
    };
  }

  /**
   * Find the most relevant file path from the latest user input and history.
   *
   * @param {string} userInput
   * @param {Array<{role: string, content: string}>} history
   * @returns {string | null}
   */
  findCurrentTargetFile(userInput, history) {
    const sources = [
      { role: "user", content: userInput },
      ...[...history].reverse(),
    ];

    for (const source of sources) {
      const parsedPath = this.extractPathFromStructuredContent(source.content);

      if (parsedPath) {
        return parsedPath;
      }

      const matchedPath = this.extractPathFromText(source.content);

      if (matchedPath) {
        return matchedPath;
      }
    }

    return null;
  }

  /**
   * Try to extract a path from JSON-like tool messages.
   *
   * @param {string} content
   * @returns {string | null}
   */
  extractPathFromStructuredContent(content) {
    if (typeof content !== "string") {
      return null;
    }

    try {
      const parsed = JSON.parse(content);

      if (typeof parsed?.args?.path === "string") {
        return this.resolveWorkspacePath(parsed.args.path);
      }

      if (typeof parsed?.data?.path === "string") {
        return this.resolveWorkspacePath(parsed.data.path);
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Extract a likely file path from plain text.
   *
   * @param {string} content
   * @returns {string | null}
   */
  extractPathFromText(content) {
    if (typeof content !== "string") {
      return null;
    }

    const matches = content.match(
      /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[A-Za-z0-9_-]+[\\/])[^\s"'`<>|:*?]+(?:[\\/][^\s"'`<>|:*?]+)*\.[A-Za-z0-9]+|[A-Za-z0-9_-]+\.[A-Za-z0-9]+/g
    );

    if (!matches?.length) {
      return null;
    }

    const lastMatch = matches[matches.length - 1].trim();
    return this.resolveWorkspacePath(lastMatch);
  }

  /**
   * Resolve a candidate path against the workspace root.
   *
   * @param {string} candidate
   * @returns {string | null}
   */
  resolveWorkspacePath(candidate) {
    if (!candidate || typeof candidate !== "string") {
      return null;
    }

    const cleanedPath = candidate.replace(/^["'`]|["'`]$/g, "").trim();

    if (!cleanedPath) {
      return null;
    }

    const absolutePath = path.isAbsolute(cleanedPath)
      ? path.resolve(cleanedPath)
      : path.resolve(this.workspaceRoot, cleanedPath);
    const relativePath = path.relative(this.workspaceRoot, absolutePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return null;
    }

    return absolutePath;
  }

  /**
   * Convert an absolute workspace path into a normalized relative path.
   *
   * @param {string} targetPath
   * @returns {string}
   */
  toWorkspaceRelative(targetPath) {
    const relativePath = path.relative(this.workspaceRoot, targetPath);

    if (!relativePath || relativePath === ".") {
      return ".";
    }

    return relativePath.split(path.sep).join("/");
  }
}

export default new WorkspaceContext();
