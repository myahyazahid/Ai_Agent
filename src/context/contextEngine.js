// src/context/contextEngine.js

import eventBus from "../core/eventBus.js";
import fileSelector from "./fileSelector.js";
import fileResolver from "./fileResolver.js";
import relevanceScorer from "./relevanceScorer.js";
import tokenBudget from "./tokenBudget.js";
import contextAssembler from "./contextAssembler.js";
import contextCache from "./contextCache.js";

const DEFAULT_TOKEN_BUDGET = 30000;

/**
 * Orchestrates the complete context selection and ranking pipeline.
 *
 * Emits events, manages the ContextCache, and coordinates:
 *   FileSelector → FileResolver → RelevanceScorer → TokenBudget → ContextAssembler
 *
 * Never interacts directly with the LLM or generates prompt strings.
 */
export class ContextEngine {
  /**
   * @param {object} [options]
   * @param {import("./fileSelector.js").FileSelector} [options.fileSelector]
   * @param {import("./fileResolver.js").FileResolver} [options.fileResolver]
   * @param {import("./relevanceScorer.js").RelevanceScorer} [options.relevanceScorer]
   * @param {import("./tokenBudget.js").TokenBudget} [options.tokenBudget]
   * @param {import("./contextAssembler.js").ContextAssembler} [options.contextAssembler]
   * @param {import("./contextCache.js").ContextCache} [options.contextCache]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({
    fileSelector: selector = fileSelector,
    fileResolver: resolver = fileResolver,
    relevanceScorer: scorer = relevanceScorer,
    tokenBudget: budget = tokenBudget,
    contextAssembler: assembler = contextAssembler,
    contextCache: cache = contextCache,
    eventBus: engineEventBus = eventBus,
  } = {}) {
    this.fileSelector = selector;
    this.fileResolver = resolver;
    this.relevanceScorer = scorer;
    this.tokenBudget = budget;
    this.contextAssembler = assembler;
    this.contextCache = cache;
    this.eventBus = engineEventBus;
  }

  /**
   * Run the context intelligence pipeline.
   *
   * @param {object} params
   * @param {string} params.request - Alphanumeric user query/prompt.
   * @param {object} params.workspace - Project metadata from WorkspaceService.
   * @param {string | null} params.activeFile - Active workspace target file.
   * @param {string[]} params.recentFiles - Workspace files referenced in recent history.
   * @param {number} [params.maxTokens] - Max token limit allowed.
   * @returns {Promise<{
   *   workspace: object,
   *   relevantFiles: Array<{file: object, score: number}>,
   *   selectedFiles: object[],
   *   context: object,
   *   tokenEstimate: number
   * }>}
   */
  async build({ request, workspace, activeFile, recentFiles, maxTokens = DEFAULT_TOKEN_BUDGET }) {
    this.emitStatus("Context building started", {
      phase: "context:building",
      request,
      activeFile,
    });

    const signature = this.contextCache.generateSignature({
      request,
      activeFile,
      recentFiles,
    });

    const cached = this.contextCache.load(signature);

    if (cached) {
      this.emitStatus("Context assembled", {
        phase: "context:ready",
        cached: true,
      });

      return {
        workspace,
        relevantFiles: cached.relevantFiles,
        selectedFiles: cached.selectedFiles,
        context: cached,
        tokenEstimate: cached.contextSummary.selectedFileCount * 100, // simple heuristic placeholder for estimate
      };
    }

    // 1. Selection
    const candidates = this.fileSelector.select({
      request,
      workspace,
      activeFile,
      recentFiles,
    });

    // 2. Resolution (ambiguous user reference resolution)
    const resolvedCandidates = this.fileResolver.resolve(candidates, {
      request,
      workspace,
    });

    // 3. Scoring / Relevance ranking
    const scoredFiles = this.relevanceScorer.score(resolvedCandidates, {
      request,
      activeFile,
      recentFiles,
    });

    // 4. Token Budget application
    const budgetResult = this.tokenBudget.budget(scoredFiles, maxTokens);

    // 5. Context Assembly
    const assembledContext = this.contextAssembler.assemble({
      workspace,
      relevantFiles: scoredFiles,
      selectedFiles: budgetResult.selectedFiles,
      request,
    });

    // 6. Cache
    this.contextCache.save(signature, assembledContext);

    this.emitStatus("Context assembled", {
      phase: "context:ready",
      cached: false,
      selectedFilesCount: budgetResult.selectedFiles.length,
      estimatedTokens: budgetResult.estimatedTokens,
    });

    return {
      workspace,
      relevantFiles: scoredFiles,
      selectedFiles: budgetResult.selectedFiles,
      context: assembledContext,
      tokenEstimate: budgetResult.estimatedTokens,
    };
  }

  /**
   * Emit a status update.
   *
   * @param {string} message
   * @param {Record<string, unknown>} [payload]
   * @returns {boolean}
   */
  emitStatus(message, payload = {}) {
    if (!this.eventBus) {
      return false;
    }

    return this.eventBus.emitStatus(message, {
      source: "contextEngine",
      ...payload,
    });
  }
}

export default new ContextEngine();
