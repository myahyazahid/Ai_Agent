// src/decision/strategyResolver.js

/**
 * Deterministic strategy resolution engine.
 */
export class StrategyResolver {
  /**
   * Resolve appropriate decision based on task analysis and capabilities summary.
   *
   * @param {string} requestText - User request text.
   * @param {import("../planner/taskAnalyzer.js").TaskAnalysis} analysis - Task category.
   * @param {import("../planner/projectInspector.js").CapabilitySummary} capabilities - Project capabilities.
   * @returns {import("./decisionCache.js").Decision}
   */
  resolve(requestText, analysis, capabilities) {
    const query = requestText.toLowerCase();

    // 1. Identify Project Type
    let projectType = "CLI";
    const caps = capabilities.capabilities || {};
    const isExpress = capabilities.framework === "Express" || caps.routing === "express";
    const isNext = capabilities.framework === "Next.js" || caps.routing === "next";

    if (isExpress || isNext) {
      projectType = "REST API";
    }

    const fallbackMode = capabilities.confidence < 0.6;

    // 2. Resolve Strategy Details
    let strategy = "none";
    let reason = "No specific implementation strategy required.";
    let confidence = capabilities.confidence;
    let alternatives = [];

    const isAuthRequest = analysis.category === "feature" || query.includes("auth") || query.includes("login");

    if (isAuthRequest) {
      if (fallbackMode) {
        strategy = "create_auth_scratch";
        reason = "Project confidence is low. Defaulting to general authentication setup.";
        confidence = 0.5;
      } else if (projectType === "CLI" && !query.includes("jwt") && !query.includes("nextauth")) {
        strategy = "clarify";
        reason = "No web framework detected.";
        confidence = 0.96;
        alternatives = [
          "Convert project into Express API",
          "Implement CLI authentication"
        ];
      } else {
        // REST API
        if (query.includes("jwt")) {
          if (caps.authentication === "jwt") {
            strategy = "reuse_existing_auth";
            reason = "Existing JWT middleware detected.";
            confidence = 0.99;
          } else {
            strategy = "create_auth_scratch";
            reason = "User explicitly requested JWT authentication.";
            confidence = 0.98;
          }
        } else if (query.includes("nextauth")) {
          strategy = "integrate_nextauth";
          reason = "User explicitly requested NextAuth.";
          confidence = 0.98;
        } else if (caps.authentication === "jwt") {
          strategy = "reuse_existing_auth";
          reason = "Existing JWT middleware detected.";
          confidence = 0.99;
        } else if (caps.authentication === "nextauth") {
          strategy = "integrate_nextauth";
          reason = "NextAuth configuration detected.";
          confidence = 0.98;
        } else {
          strategy = "create_auth_scratch";
          reason = "No existing authentication found.";
          confidence = 0.90;
        }
      }
    } else if (analysis.category === "refactor" || analysis.category === "bug_fix") {
      strategy = "none";
      reason = "Direct file refactoring/fixing resolved.";
      confidence = 1.0;
    }

    return {
      goal: requestText,
      projectType,
      strategy,
      reason,
      confidence,
      alternatives,
    };
  }
}

export default new StrategyResolver();
