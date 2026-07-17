// src/planner/planner.js

import taskAnalyzer from "./taskAnalyzer.js";
import planGenerator from "./planGenerator.js";
import planValidator from "./planValidator.js";
import dependencyResolver from "./dependencyResolver.js";
import progressTracker from "./progressTracker.js";
import planCache from "./planCache.js";
import projectInspector from "./projectInspector.js";
import decisionEngine from "../decision/decisionEngine.js";
import eventBus from "../core/eventBus.js";

/**
 * Public facade orchestrator for the Planner Layer.
 * Coordinates planning lifecycle and exposes nextStep() models.
 */
export class Planner {
  /**
   * @param {object} [options]
   * @param {import("./taskAnalyzer.js").TaskAnalyzer} [options.analyzer]
   * @param {import("./planGenerator.js").PlanGenerator} [options.generator]
   * @param {import("./planValidator.js").PlanValidator} [options.validator]
   * @param {import("./dependencyResolver.js").DependencyResolver} [options.resolver]
   * @param {import("./progressTracker.js").ProgressTracker} [options.tracker]
   * @param {import("./planCache.js").PlanCache} [options.cache]
   * @param {import("./projectInspector.js").ProjectInspector} [options.inspector]
   * @param {import("../decision/decisionEngine.js").DecisionEngine} [options.decisionEngine]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({
    analyzer = taskAnalyzer,
    generator = planGenerator,
    validator = planValidator,
    resolver = dependencyResolver,
    tracker = progressTracker,
    cache = planCache,
    inspector = projectInspector,
    decisionEngine: decEngine = decisionEngine,
    eventBus: plannerEventBus = eventBus,
  } = {}) {
    this.analyzer = analyzer;
    this.generator = generator;
    this.validator = validator;
    this.resolver = resolver;
    this.tracker = tracker;
    this.cache = cache;
    this.inspector = inspector;
    this.decisionEngine = decEngine;
    this.eventBus = plannerEventBus;
  }

  /**
   * Analyze the request and return its properties.
   *
   * @param {string} requestText
   * @param {object | null} [workspaceData]
   * @returns {import("./taskAnalyzer.js").TaskAnalysis}
   */
  analyzeTask(requestText, workspaceData = null) {
    this.emitStatus("Analyzing task properties", { phase: "planner:analyzing" });
    return this.analyzer.analyze(requestText, workspaceData);
  }

  /**
   * Generate, validate, sort, and cache an execution plan.
   *
   * @param {string} requestText
   * @param {import("./taskAnalyzer.js").TaskAnalysis} analysis
   * @param {object | null} [workspaceData]
   * @param {object | null} [decision]
   * @returns {object} The sorted Plan object.
   */
  createPlan(requestText, analysis, workspaceData = null, decision = null) {
    this.emitStatus("Inspecting project capabilities", { phase: "planner:inspecting" });

    // 1. Inspect capabilities using Workspace summary
    const summary = this.inspector.inspect(workspaceData);

    this.emitStatus("Project inspection complete", {
      phase: "planner:detected",
      summary,
    });

    // 2. Select strategy using DecisionEngine unless a clarified decision was supplied.
    const resolvedDecision = decision ?? this.decisionEngine.makeDecision(requestText, analysis, summary);

    // 3. Generate plan containing Goal and raw steps using decision summary
    const plan = this.generator.generate(requestText, analysis, resolvedDecision);

    // 4. Validate structural constraints
    this.validator.validate(plan);

    // 5. Resolve linear order via topological dependency sorting
    const sortedSteps = this.resolver.resolve(plan.steps);
    plan.steps = sortedSteps;

    // 6. Initialize tracker and cache
    this.tracker.init(plan);
    this.cache.savePlan(plan, this.tracker, this.decisionEngine.cache);

    return plan;
  }

  /**
   * Expose the next runnable/pending step in the linear sorted queue.
   *
   * @returns {object | null} Next runnable Step object, or null if complete.
   */
  nextStep() {
    if (!this.tracker.plan) {
      return null;
    }

    const { remainingSteps } = this.tracker.getProgress();
    if (remainingSteps.length === 0) {
      this.tracker.status = "Completed";
      this.emitStatus("Plan completed", { phase: "planner:completed" });
      return null;
    }

    // Expose the first pending step
    const next = remainingSteps.find((s) => s.status === "pending");
    if (next) {
      if (next.type === "clarification") {
        this.tracker.status = "WaitingForUser";
      } else {
        this.tracker.markStepRunning(next.id);
        this.tracker.status = "Executing";
      }
      
      const idx = this.tracker.plan.steps.findIndex((s) => s.id === next.id) + 1;
      const total = this.tracker.plan.steps.length;

      this.emitStatus(`Running step ${idx}/${total}: ${next.description}`, {
        phase: "planner:step",
        iteration: idx,
        maxIterations: total,
        step: next,
      });
      return next;
    }

    return null;
  }

  /**
   * Record the outcome result of executing a step.
   *
   * @param {string} stepId
   * @param {import("./progressTracker.js").StepResult} result
   * @returns {void}
   */
  recordStepResult(stepId, result) {
    if (result.status === "success") {
      this.tracker.markStepCompleted(stepId, result);
    } else {
      this.tracker.markStepFailed(stepId, result);
    }
  }

  /**
   * Resume planning from the last failed steps.
   *
   * @returns {void}
   */
  resume() {
    this.tracker.resume();
  }

  /**
   * Emit a planner lifecycle status event.
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
      source: "planner",
      ...payload,
    });
  }
}

export default new Planner();
