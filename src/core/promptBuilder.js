// src/core/promptBuilder.js

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import memory from "./memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYSTEM_PROMPT_PATH = path.join(__dirname, "../prompts/systemPrompt.txt");

/**
 * Builds the message array sent to the model.
 */
export class PromptBuilder {
  /**
   * Build a model-ready conversation from the system prompt, memory, and user input.
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
    const systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf8");
    const contextMessage = workspaceContext
      ? this.createWorkspaceContextMessage(workspaceContext)
      : null;

    return [
      {
        role: "system",
        content: systemPrompt,
      },
      ...(contextMessage ? [contextMessage] : []),
      ...history,
      {
        role: "user",
        content: userMessage,
      },
    ];
  }

  /**
   * Create a system message describing the current workspace context.
   *
   * @param {{
   *   workspaceRoot: string,
   *   currentWorkingDirectory: string,
   *   currentTargetFile: string | null
   * }} workspaceContext
   * @returns {{role: string, content: string}}
   */
  createWorkspaceContextMessage(workspaceContext) {
    const currentTargetFile = workspaceContext.currentTargetFile ?? "(none)";

    return {
      role: "system",
      content: [
        "Workspace Context:",
        `Workspace Root: ${workspaceContext.workspaceRoot}`,
        `Current Working Directory: ${workspaceContext.currentWorkingDirectory}`,
        `Current Target File: ${currentTargetFile}`,
        "Prefer paths that stay consistent with the current working directory and target file unless the user explicitly says otherwise.",
      ].join("\n"),
    };
  }
}

export default new PromptBuilder();
