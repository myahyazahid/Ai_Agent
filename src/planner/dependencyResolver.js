// src/planner/dependencyResolver.js

/**
 * Resolves safe execution ordering by sorting step dependencies topologically.
 */
export class DependencyResolver {
  /**
   * Sort plan steps topologically.
   *
   * @param {object[]} steps - Array of Plan step objects.
   * @returns {object[]} Sorted array of steps in valid execution order.
   */
  resolve(steps) {
    if (!Array.isArray(steps) || steps.length === 0) {
      return [];
    }

    const sorted = [];
    const visited = {};
    const visiting = {};

    // Helper map for fast node lookup
    const nodeMap = {};
    for (const step of steps) {
      nodeMap[step.id] = step;
    }

    const visit = (stepId) => {
      if (visiting[stepId]) {
        throw new Error(`Dependency Error: Cyclic reference detected involving step '${stepId}'.`);
      }

      if (!visited[stepId]) {
        visiting[stepId] = true;

        const node = nodeMap[stepId];
        if (node) {
          const deps = node.dependsOn || [];
          for (const depId of deps) {
            visit(depId);
          }
        }

        visiting[stepId] = false;
        visited[stepId] = true;
        if (node) {
          sorted.push(node);
        }
      }
    };

    for (const step of steps) {
      visit(step.id);
    }

    return sorted;
  }
}

export default new DependencyResolver();
