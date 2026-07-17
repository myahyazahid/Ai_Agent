// src/planner/planValidator.js

/**
 * Validates generated plans for structural anomalies.
 * Throws clean descriptive validation errors if issues are found.
 */
export class PlanValidator {
  /**
   * Validate plan structure.
   *
   * @param {object} plan
   * @returns {void}
   */
  validate(plan) {
    if (!plan) {
      throw new Error("Validation Error: Plan object is undefined or null.");
    }

    const steps = plan.steps;

    // 1. Empty Plan check
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new Error("Validation Error: Generated plan cannot be empty.");
    }

    const stepIds = new Set();
    const adjList = {};

    // 2. Duplicate Step IDs & Initialization
    for (const step of steps) {
      if (!step || typeof step.id !== "string" || !step.id.trim()) {
        throw new Error("Validation Error: Plan contains a step with a missing or invalid ID.");
      }

      if (stepIds.has(step.id)) {
        throw new Error(`Validation Error: Duplicate step ID identified: '${step.id}'.`);
      }

      stepIds.add(step.id);
      adjList[step.id] = [];
    }

    // 3. Invalid & Orphan dependencies check
    for (const step of steps) {
      const deps = step.dependsOn || [];
      for (const depId of deps) {
        if (typeof depId !== "string" || !depId.trim()) {
          throw new Error(`Validation Error: Step '${step.id}' contains an invalid empty dependency reference.`);
        }

        if (!stepIds.has(depId)) {
          throw new Error(`Validation Error: Step '${step.id}' depends on a non-existent step: '${depId}' (orphan dependency).`);
        }

        // Add edge for circular dependency detection
        adjList[step.id].push(depId);
      }
    }

    // 4. Circular Dependency check (DFS cycle detection)
    const visited = {};
    const recStack = {};

    const hasCycle = (nodeId) => {
      visited[nodeId] = true;
      recStack[nodeId] = true;

      const neighbors = adjList[nodeId] || [];
      for (const neighbor of neighbors) {
        if (!visited[neighbor]) {
          if (hasCycle(neighbor)) {
            return true;
          }
        } else if (recStack[neighbor]) {
          return true;
        }
      }

      recStack[nodeId] = false;
      return false;
    };

    for (const stepId of stepIds) {
      if (!visited[stepId]) {
        if (hasCycle(stepId)) {
          throw new Error("Validation Error: Circular dependency detected in execution plan.");
        }
      }
    }
  }
}

export default new PlanValidator();
