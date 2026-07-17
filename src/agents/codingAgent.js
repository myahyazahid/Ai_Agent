import { access } from "node:fs/promises";
import promptBuilder from "../core/promptBuilder.js";
import memory from "../core/memory.js";
import llm from "../core/llm.js";
import eventBus from "../core/eventBus.js";
import toolParser from "../core/toolParser.js";
import toolRegistry from "../registry/toolRegistry.js";
import workspaceContext from "../core/workspaceContext.js";
import workspaceService from "../workspace/workspaceService.js";
import contextEngine from "../context/contextEngine.js";
import editingEngine from "../editing/editingEngine.js";

const DEFAULT_MAX_ITERATIONS = 15;

export class CodingAgent {
  /**
   * @param {object} [dependencies]
   * @param {typeof promptBuilder} [dependencies.promptBuilder]
   * @param {typeof memory} [dependencies.memory]
   * @param {typeof llm} [dependencies.llm]
   * @param {typeof toolParser} [dependencies.toolParser]
   * @param {typeof toolRegistry} [dependencies.toolRegistry]
   * @param {typeof workspaceContext} [dependencies.workspaceContext]
   * @param {typeof workspaceService} [dependencies.workspaceService]
   * @param {typeof contextEngine} [dependencies.contextEngine]
   * @param {typeof editingEngine} [dependencies.editingEngine]
   * @param {import("../core/eventBus.js").AgentEventBus} [dependencies.eventBus]
   * @param {number} [dependencies.maxIterations]
   */
  constructor({
    promptBuilder: promptBuilderService = promptBuilder,
    memory: memoryStore = memory,
    llm: llmClient = llm,
    toolParser: responseToolParser = toolParser,
    toolRegistry: registeredTools = toolRegistry,
    workspaceContext: workspaceContextBuilder = workspaceContext,
    workspaceService: workspaceKnowledgeService = workspaceService,
    contextEngine: contextEngineService = contextEngine,
    editingEngine: codeEditingEngine = editingEngine,
    eventBus: executionEventBus = eventBus,
    maxIterations = DEFAULT_MAX_ITERATIONS,
  } = {}) {
    this.promptBuilder = promptBuilderService;
    this.memory = memoryStore;
    this.llm = llmClient;
    this.toolParser = responseToolParser;
    this.toolRegistry = registeredTools;
    this.workspaceContext = workspaceContextBuilder;
    this.workspaceService = workspaceKnowledgeService;
    this.contextEngine = contextEngineService;
    this.editingEngine = codeEditingEngine;
    this.eventBus = executionEventBus;
    this.eventSource = "codingAgent";
    this.maxIterations = maxIterations;
  }

  /**
   * Run a multi-step agent loop until the model returns a final response or the
   * iteration budget is exhausted.
   *
   * Flow:
   *   1. Build the initial message array (system prompt + history + user input).
   *   2. Send to the LLM.
   *   3. Parse the response.
   *   4. If tool_call → execute tool → append result as a user message → loop.
   *   5. If response → persist memory → return.
   *   6. If max iterations reached → return agent_error.
   *
   * @param {string} userInput
   * @returns {Promise<
   *   | {
   *       type: "response",
   *       role: string,
   *       content: string,
   *       thinking: string,
   *       done: boolean,
   *       raw: Record<string, unknown>,
   *       iterations: number,
   *       toolResults: Array<{
   *         type: "tool_result",
   *         tool: string,
   *         success: boolean,
   *         message: string,
   *         data: Record<string, unknown> | null
   *       }>
   *     }
   *   | {
   *       type: "agent_error",
   *       success: false,
   *       message: string,
   *       iterations: number,
   *       toolResults: Array<{
   *         type: "tool_result",
   *         tool: string,
   *         success: boolean,
   *         message: string,
   *         data: Record<string, unknown> | null
   *       }>
   *     }
   * >}
   */
  async chat(userInput) {
    this.emitStatus("Understanding request");
    this.emitStatus("Planning", { phase: "planning" });

    // Load project-level knowledge (cached after first scan).
    const workspaceData = await this.workspaceService.load();

    const history = this.memory.get();
    const context = this.workspaceContext.build({
      userInput,
      history,
    });

    const recentFiles = this.extractRecentFiles(history);

    // Build context through contextEngine
    const contextEngineResult = await this.contextEngine.build({
      request: userInput,
      workspace: workspaceData,
      activeFile: context.currentTargetFile,
      recentFiles,
    });

    const messages = this.promptBuilder.build(userInput, history, context, contextEngineResult.context);
    const newMemoryMessages = [{ role: "user", content: userInput }];
    const toolResults = [];

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      const response = await this.requestModel(messages, iteration);
      const parsed = this.toolParser.parse(response.content);

      if (parsed.type === "response") {
        const finalContent = parsed.content;

        newMemoryMessages.push({
          role: response.role,
          content: finalContent,
        });
        this.persistMemoryMessages(newMemoryMessages);
        this.emitDone({
          role: response.role,
          done: response.done,
          iterations: iteration,
          toolCount: toolResults.length,
          success: true,
        });

        return {
          type: "response",
          role: response.role,
          content: finalContent,
          thinking: response.thinking,
          done: response.done,
          raw: response.raw,
          iterations: iteration,
          toolResults,
        };
      }

      if (parsed.type === "invalid_format") {
        const assistantMsg = this.createAssistantMessage(response.content);
        const correctionMsg = {
          role: "user",
          content: "Format Error: Your output was not a valid JSON object. You must return ONLY a single JSON object. If you want to make a code modification, return a tool_call to 'write_file'. If you are done, return a response JSON. Do NOT include conversational text or markdown wrapping outside JSON."
        };

        messages.push(assistantMsg);
        newMemoryMessages.push(assistantMsg);

        messages.push(correctionMsg);
        newMemoryMessages.push(correctionMsg);

        this.emitStatus("Formatting correction requested", {
          phase: "continuing",
          iteration,
          maxIterations: this.maxIterations,
        });

        continue;
      }

      // Append the raw assistant tool-call message so the model sees its own output.
      const assistantToolCallMessage = this.createAssistantMessage(response.content);
      messages.push(assistantToolCallMessage);
      newMemoryMessages.push(assistantToolCallMessage);

      // Execute the tool and capture the result.
      const toolResult = await this.executeToolCall(parsed, iteration, workspaceData);

      // Append the tool result as a **user** message so Ollama processes it.
      // Ollama only supports system/user/assistant roles — using role: "tool"
      // causes the message to be silently dropped.
      const toolMessage = this.createToolResultMessage(toolResult);

      toolResults.push(toolResult);
      messages.push(toolMessage);
      newMemoryMessages.push(toolMessage);

      this.emitStatus("Continuing", {
        phase: "continuing",
        iteration,
        maxIterations: this.maxIterations,
        tool: parsed.tool,
      });
    }

    const errorResult = {
      type: "agent_error",
      success: false,
      message: "Agent exceeded maximum execution steps.",
      iterations: this.maxIterations,
      toolResults,
    };

    newMemoryMessages.push(
      this.createAssistantMessage(errorResult.message)
    );
    this.persistMemoryMessages(newMemoryMessages);
    this.emitStatus(errorResult.message, { phase: "max_iterations" });
    this.emitDone({
      done: false,
      success: false,
      iterations: this.maxIterations,
      toolCount: toolResults.length,
    });

    return errorResult;
  }

  /**
   * Request the next action from the model.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {number} iteration
   * @returns {Promise<{
   *   role: string,
   *   content: string,
   *   thinking: string,
   *   done: boolean,
   *   raw: Record<string, unknown>
   * }>}
   */
  async requestModel(messages, iteration) {
    this.emitStatus("Deciding next action", {
      phase: "llm",
      iteration,
      maxIterations: this.maxIterations,
    });

    return this.llm.chat(messages);
  }

  /**
   * Resolve and execute a parsed tool call, then return a normalized tool result.
   *
   * On failure (tool not found or execution error), the error is captured into
   * a tool result and returned — it is NOT thrown. This allows the model to
   * observe the failure and decide whether to retry or try a different approach.
   *
   * @param {{type: "tool_call", tool: string, args: Record<string, unknown>}} parsed
   * @param {number} iteration
   * @returns {{
   *   type: "tool_result",
   *   tool: string,
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }}
   */
  async executeToolCall(parsed, iteration, workspaceData = null) {
    this.emitStatus("Tool Selected", {
      phase: "tool_selected",
      tool: parsed.tool,
      args: parsed.args,
      iteration,
    });

    if (!this.toolRegistry.has(parsed.tool)) {
      const result = this.createToolResult(
        parsed.tool,
        false,
        `Tool '${parsed.tool}' not found. Available tools: ${this.toolRegistry.list().map(t => t.name).join(", ")}.`
      );

      this.emitStatus("Tool Failed", {
        phase: "tool_failed",
        tool: parsed.tool,
        args: parsed.args,
        iteration,
        result,
      });

      return result;
    }

    const tool = this.toolRegistry.get(parsed.tool);

    if (parsed.tool === "write_file") {
      const filePath = parsed.args?.path;
      if (filePath && typeof filePath === "string") {
        const resolvedPath = tool.resolvePath(filePath);
        const fileExists = await access(resolvedPath).then(() => true).catch(() => false);

        if (fileExists) {
          try {
            // Get the last user request text
            const userMessages = this.memory.get().filter(m => m.role === "user");
            const lastUserRequest = userMessages[userMessages.length - 1]?.content || "Modify file";

            const editResult = await this.editingEngine.applyEdit({
              request: {
                text: lastUserRequest,
                proposedContent: parsed.args.content,
              },
              workspace: workspaceData,
              targetFile: resolvedPath,
            });

            const result = this.createToolResult(
              "write_file",
              true,
              `File '${filePath}' successfully edited incrementally. Diff:\n${editResult.diff}`
            );

            this.emitStatus("Tool Finished", {
              phase: "tool_finished",
              tool: parsed.tool,
              args: parsed.args,
              iteration,
              result,
            });

            return result;
          } catch (error) {
            const result = this.createToolResult(
              "write_file",
              false,
              `Editing safety check/modification failed: ${error instanceof Error ? error.message : "Code transformation failed."}`
            );

            this.emitStatus("Tool Failed", {
              phase: "tool_failed",
              tool: parsed.tool,
              args: parsed.args,
              iteration,
              result,
            });

            return result;
          }
        }
      }
    }

    this.emitStatus("Executing Tool", {
      phase: "tool_executing",
      tool: parsed.tool,
      args: parsed.args,
      iteration,
    });

    try {
      const rawResult = await tool.execute(parsed.args);
      const normalizedResult = this.normalizeToolResult(parsed.tool, rawResult);

      this.emitStatus(
        normalizedResult.success ? "Tool Finished" : "Tool Failed",
        {
          phase: normalizedResult.success ? "tool_finished" : "tool_failed",
          tool: parsed.tool,
          args: parsed.args,
          iteration,
          result: normalizedResult,
        }
      );

      return normalizedResult;
    } catch (error) {
      const result = this.createToolResult(
        parsed.tool,
        false,
        error instanceof Error ? error.message : "Tool execution failed."
      );

      this.emitStatus("Tool Failed", {
        phase: "tool_failed",
        tool: parsed.tool,
        args: parsed.args,
        iteration,
        result,
      });

      return result;
    }
  }

  /**
   * Normalize any tool return value to the shared tool-result schema.
   *
   * @param {string} toolName
   * @param {unknown} rawResult
   * @returns {{
   *   type: "tool_result",
   *   tool: string,
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }}
   */
  normalizeToolResult(toolName, rawResult) {
    if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) {
      return this.createToolResult(toolName, false, "Tool returned an invalid result.");
    }

    const result = /** @type {Record<string, unknown>} */ (rawResult);

    return this.createToolResult(
      typeof result.tool === "string" ? result.tool : toolName,
      result.success === true,
      typeof result.message === "string"
        ? result.message
        : "Tool execution completed.",
      result.data && typeof result.data === "object" && !Array.isArray(result.data)
        ? { ...result.data }
        : null
    );
  }

  /**
   * Create a standard structured tool result.
   *
   * @param {string} tool
   * @param {boolean} success
   * @param {string} message
   * @param {Record<string, unknown> | null} [data]
   * @returns {{
   *   type: "tool_result",
   *   tool: string,
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }}
   */
  createToolResult(tool, success, message, data = null) {
    return {
      type: "tool_result",
      tool,
      success,
      message,
      data,
    };
  }

  /**
   * Create an assistant message object.
   *
   * @param {string} content
   * @returns {{role: string, content: string}}
   */
  createAssistantMessage(content) {
    return {
      role: "assistant",
      content,
    };
  }

  /**
   * Convert a tool result into a message that the model can inspect in the next
   * iteration of the execution loop.
   *
   * Uses role: "user" with a [Tool Result] prefix because Ollama only supports
   * system/user/assistant roles. Using role: "tool" would cause the message to
   * be silently dropped, breaking the feedback loop entirely.
   *
   * @param {{
   *   type: "tool_result",
   *   tool: string,
   *   success: boolean,
   *   message: string,
   *   data: Record<string, unknown> | null
   * }} toolResult
   * @returns {{role: string, content: string}}
   */
  createToolResultMessage(toolResult) {
    return {
      role: "user",
      content: `[Tool Result]\n${JSON.stringify(toolResult, null, 2)}\n\nREMINDER: You must output ONLY a single JSON object. If you want to make a code modification, return a tool_call to 'write_file'. Do NOT include any natural language explanation, commentary, or markdown wrapping.`,
    };
  }

  /**
   * Persist the new execution messages into shared memory.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @returns {void}
   */
  persistMemoryMessages(messages) {
    this.memory.addMany(messages);
  }

  /**
   * Emit an execution status update.
   *
   * @param {string} message
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitStatus(message, payload = {}) {
    return this.eventBus.emitStatus(message, {
      source: this.eventSource,
      ...payload,
    });
  }

  emitDone(payload = {}) {
    return this.eventBus.emitDone({
      source: this.eventSource,
      ...payload,
    });
  }
  /**
   * Extract unique file paths referenced in recent conversation history.
   *
   * Matches both structured JSON patterns and raw text paths with file extensions.
   *
   * @param {Array<{role: string, content: string}>} history
   * @returns {string[]}
   */
  extractRecentFiles(history) {
    const recent = new Set();
    const pathRegex = /(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+/g;

    for (const msg of history) {
      if (typeof msg.content !== "string") {
        continue;
      }

      // Try parsing JSON first (if it's a tool call/result)
      try {
        const parsed = JSON.parse(msg.content);
        const filePath = parsed.args?.path || parsed.data?.path || parsed.toolResult?.data?.path;
        if (filePath && typeof filePath === "string") {
          recent.add(filePath);
          continue;
        }
      } catch {
        // Not JSON
      }

      // Text fallback
      const matches = msg.content.match(pathRegex);
      if (matches) {
        for (const match of matches) {
          const clean = match.replace(/\\/g, "/").replace(/^\.\//, "");
          // Filter out numbers disguised as files (e.g. 1.7.0)
          if (clean.includes(".") && !/\d+\.\d+\.\d+/.test(clean)) {
            recent.add(clean);
          }
        }
      }
    }

    return Array.from(recent);
  }
}

export default new CodingAgent();
