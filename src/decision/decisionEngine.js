// src/decision/decisionEngine.js

import strategyResolver from "./strategyResolver.js";
import decisionCache from "./decisionCache.js";
import eventBus from "../core/eventBus.js";

/**
 * Public facade orchestrator for the Decision Engine Layer.
 */
export class DecisionEngine {
  /**
   * @param {object} [options]
   * @param {import("./strategyResolver.js").StrategyResolver} [options.resolver]
   * @param {import("./decisionCache.js").DecisionCache} [options.cache]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({
    resolver = strategyResolver,
    cache = decisionCache,
    eventBus: decisionEventBus = eventBus,
  } = {}) {
    this.resolver = resolver;
    this.cache = cache;
    this.eventBus = decisionEventBus;
  }

  /**
   * Select the appropriate implementation strategy.
   *
   * @param {string} requestText - User request text.
   * @param {import("../planner/taskAnalyzer.js").TaskAnalysis} analysis - Task category properties.
   * @param {import("../planner/projectInspector.js").CapabilitySummary} capabilities - Project capability summary.
   * @returns {import("./decisionCache.js").Decision}
   */
  makeDecision(requestText, analysis, capabilities) {
    this.emitStatus("Selecting strategy", { phase: "decision:selecting" });

    // 1. Resolve strategy decision
    const decision = this.resolver.resolve(requestText, analysis, capabilities);

    // 2. Cache resolved decision
    this.cache.saveDecision(decision);

    // 3. Emit completed status
    this.emitStatus("Decision selected", {
      phase: "decision:resolved",
      decision,
    });

    return decision;
  }

  /**
   * Select the strategy based on clarification query answer.
   *
   * @param {import("./decisionCache.js").Decision} originalDecision
   * @param {string} replyText
   * @param {import("../planner/projectInspector.js").CapabilitySummary} capabilities
   * @returns {import("./decisionCache.js").Decision}
   */
  resolveClarification(originalDecision, replyText, capabilities) {
    this.emitStatus("Resolving clarification strategy", { phase: "decision:selecting" });

    // 1. Resolve strategy decision
    const decision = this.resolver.resolveClarification(originalDecision, replyText, capabilities);

    // 2. Cache resolved decision
    this.cache.saveDecision(decision);

    // 3. Emit completed status
    this.emitStatus("Decision selected after clarification", {
      phase: "decision:resolved",
      decision,
    });

    return decision;
  }

  /**
   * Emit status event helper.
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
      source: "decisionEngine",
      ...payload,
    });
  }
}

export default new DecisionEngine();
