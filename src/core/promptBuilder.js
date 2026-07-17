// src/core/promptBuilder.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import memory from "./memory.js";
import contextBuilder from "./contextBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_PROMPT_PATH = path.join(__dirname, "../prompts/systemPrompt.txt");

const WORKSPACE_CONTEXT_PLACEHOLDER = "{{WORKSPACE_CONTEXT}}";
const PROJECT_CONTEXT_PLACEHOLDER = "{{PROJECT_CONTEXT}}";

/**
 * Builds the message array sent to the model.
 *
 * Responsible for formatting both workspace context (CWD, target file) and
 * project context (framework, dependencies, tree) into the system prompt.
 */
export class PromptBuilder {
  /**
   * @param {object} [options]
   * @param {import("./contextBuilder.js").ContextBuilder} [options.contextBuilder]
   */
  constructor({ contextBuilder: ctxBuilder = contextBuilder } = {}) {
    this.contextBuilder = ctxBuilder;
  }

  /**
   * Build a model-ready conversation from the system prompt, memory,
   * workspace context, project knowledge, and user input.
   *
   * @param {string} userMessage
   * @param {Array<{role: string, content: string}>} [history]
   * @param {{
   *   workspaceRoot: string,
   *   currentWorkingDirectory: string,
   *   currentTargetFile: string | null
   * } | null} [workspaceContext]
   * @param {object | null} [workspaceData] - AssembledContext from ContextEngine, or WorkspaceData.
   * @returns {Array<{role: string, content: string}>}
   */
  build(userMessage, history = memory.get(), workspaceContext = null, workspaceData = null) {
    const systemPromptTemplate = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
    const workspaceBlock = this.formatWorkspaceContext(workspaceContext);
    const projectBlock = this.contextBuilder.format(workspaceData);

    const systemPrompt = systemPromptTemplate
      .replace(WORKSPACE_CONTEXT_PLACEHOLDER, workspaceBlock)
      .replace(PROJECT_CONTEXT_PLACEHOLDER, projectBlock);

    return [
      {
        role: "system",
        content: systemPrompt,
      },
      ...history,
      {
        role: "user",
        content: userMessage,
      },
    ];
  }

  /**
   * Format workspace context into a text block for template injection.
   *
   * @param {{
   *   workspaceRoot: string,
   *   currentWorkingDirectory: string,
   *   currentTargetFile: string | null
   * } | null} workspaceContext
   * @returns {string}
   */
  formatWorkspaceContext(workspaceContext) {
    if (!workspaceContext) {
      return [
        "WORKSPACE CONTEXT:",
        `Workspace Root: ${process.cwd()}`,
        "Current Working Directory: .",
        "Current Target File: (none)",
        "",
        "All file paths in tool arguments MUST be relative to the Workspace Root.",
      ].join("\n");
    }

    const targetFile = workspaceContext.currentTargetFile ?? "(none)";

    return [
      "WORKSPACE CONTEXT:",
      `Workspace Root: ${workspaceContext.workspaceRoot}`,
      `Current Working Directory: ${workspaceContext.currentWorkingDirectory}`,
      `Current Target File: ${targetFile}`,
      "",
      "All file paths in tool arguments MUST be relative to the Workspace Root.",
      "Keep new files consistent with the Current Working Directory unless the user says otherwise.",
    ].join("\n");
  }
}

export default new PromptBuilder();
