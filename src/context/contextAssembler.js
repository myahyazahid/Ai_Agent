// src/context/contextAssembler.js

/**
 * @typedef {object} AssembledContext
 * @property {object} workspace - Structured project identity data from WorkspaceService.
 * @property {Array<{file: object, score: number}>} relevantFiles - The ranked candidates list.
 * @property {object[]} selectedFiles - The budgeted candidates list.
 * @property {string} request - Original user request prompt.
 * @property {{
 *   framework: string | null,
 *   language: string | null,
 *   runtime: string | null,
 *   packageManager: string | null,
 *   entryPoint: string | null,
 *   totalFiles: number,
 *   selectedFileCount: number,
 *   selectedPaths: string[]
 * }} contextSummary - A lightweight context summary for future Planner usage.
 */

/**
 * Assembles the final structured context object.
 * Returns both detailed selected files and a lightweight context summary.
 *
 * Does NOT generate the final LLM prompt string (presentation concern).
 */
export class ContextAssembler {
  /**
   * Assemble structured context.
   *
   * @param {object} params
   * @param {object} params.workspace - Workspace data.
   * @param {Array<{file: object, score: number}>} params.relevantFiles - Ranked relevant files.
   * @param {object[]} params.selectedFiles - Budgeted selected files.
   * @param {string} params.request - User query.
   * @returns {AssembledContext}
   */
  assemble({ workspace, relevantFiles, selectedFiles, request }) {
    const selectedPaths = selectedFiles.map((f) => f.relativePath || f.name);

    // Build the lightweight context summary
    const contextSummary = {
      framework: workspace.framework ?? null,
      language: workspace.language ?? null,
      runtime: workspace.runtime ?? null,
      packageManager: workspace.packageManager ?? null,
      entryPoint: workspace.entryPoint ?? null,
      totalFiles: workspace.stats?.totalFiles ?? 0,
      selectedFileCount: selectedFiles.length,
      selectedPaths,
    };

    return {
      workspace,
      relevantFiles,
      selectedFiles,
      request,
      contextSummary,
    };
  }
}

export default new ContextAssembler();
