// src/core/promptBuilder.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import memory from "./memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_PROMPT_PATH = path.join(__dirname, "../prompts/systemPrompt.txt");

const WORKSPACE_CONTEXT_PLACEHOLDER = "{{WORKSPACE_CONTEXT}}";

/**
 * Builds the message array sent to the model.
 */
export class PromptBuilder {
  /**
   * Build a model-ready conversation from the system prompt, memory, and user input.
   *
   * Workspace context is injected directly into the system prompt template via
   * the {{WORKSPACE_CONTEXT}} placeholder, ensuring the model treats it as a
   * first-class instruction rather than a secondary system message.
   *
   * @param {string} userMessage
   * @param {Array<{role: string, content: string}>} [history]
   * @param {{
   *   workspaceRoot: string,
   *   currentWorkingDirectory: string,
   *   currentTargetFile: string | null
   * } | null} [workspaceContext]
   * @returns {Array<{role: string, content: string}>}
   */
  build(userMessage, history = memory.get(), workspaceContext = null) {
    const systemPromptTemplate = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
    const contextBlock = this.formatWorkspaceContext(workspaceContext);
    const systemPrompt = systemPromptTemplate.replace(
      WORKSPACE_CONTEXT_PLACEHOLDER,
      contextBlock
    );

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
