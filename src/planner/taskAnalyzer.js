// src/planner/taskAnalyzer.js

/**
 * @typedef {object} TaskAnalysis
 * @property {string} category - Classified task category.
 * @property {"low" | "medium" | "high"} complexity - Estimated task difficulty.
 * @property {number} expectedSteps - Estimated number of steps.
 * @property {boolean} planningRequired - True if task requires a multi-step plan.
 */

/**
 * Analyzes the user request text and context to classify the task
 * and estimate complexity.
 */
export class TaskAnalyzer {
  /**
   * Analyze task properties.
   *
   * @param {string} requestText - User request text.
   * @param {object | null} [workspaceData] - Optional project metadata.
   * @returns {TaskAnalysis}
   */
  analyze(requestText, workspaceData = null) {
    if (!requestText) {
      return {
        category: "question",
        complexity: "low",
        expectedSteps: 1,
        planningRequired: false,
      };
    }

    const query = requestText.toLowerCase();

    // 1. Classification & Complexity Heuristics
    let category = "question";
    let complexity = "low";
    let expectedSteps = 1;
    let planningRequired = false;

    // Detect file edit requests (adding/modifying comments or simple lines)
    const isEdit = query.includes("tambahkan") || query.includes("edit") || query.includes("tulis") || query.includes("tuliskan") || query.includes("add") || query.includes("comment") || query.includes("komentar") || query.includes("update") || query.includes("replace") || query.includes("ubah");
    
    // Detect refactors
    const isRefactor = query.includes("refactor") || query.includes("rapikan") || query.includes("optimize");

    // Detect bug fixes
    const isBugFix = query.includes("fix") || query.includes("bug") || query.includes("error") || query.includes("perbaiki") || query.includes("salah");

    // Detect complex feature implementation
    const isFeature = query.includes("buat fitur") || query.includes("implementasikan") || query.includes("auth") || query.includes("middleware") || query.includes("endpoint baru") || query.includes("login") || query.includes("feature");

    // Detect terminal tasks
    const isTerminal = query.includes("npm") || query.includes("install") || query.includes("run") || query.includes("terminal") || query.includes("command") || query.includes("git");

    // Detect project analysis
    const isAnalysis = query.includes("analisis") || query.includes("explain") || query.includes("jelaskan") || query.includes("bagaimana") || query.includes("how does") || query.includes("struktur");

    if (isFeature) {
      category = "feature";
      complexity = "medium";
      expectedSteps = 4;
      planningRequired = true;
    } else if (isRefactor) {
      category = "refactor";
      complexity = "medium";
      expectedSteps = 3;
      planningRequired = true;
    } else if (isBugFix) {
      category = "bug_fix";
      complexity = "medium";
      expectedSteps = 3;
      planningRequired = true;
    } else if (isEdit) {
      category = "file_edit";
      // Determine complexity based on scope of edit
      const isLargeEdit = query.includes("semua") || query.includes("multiple") || query.includes("banyak") || query.includes("fitur");
      complexity = isLargeEdit ? "medium" : "low";
      expectedSteps = isLargeEdit ? 3 : 2;
      planningRequired = isLargeEdit; // Low complexity simple comment/line additions do not require planning
    } else if (isTerminal) {
      category = "terminal_task";
      complexity = "low";
      expectedSteps = 1;
      planningRequired = false;
    } else if (isAnalysis) {
      category = "project_analysis";
      complexity = "low";
      expectedSteps = 1;
      planningRequired = false;
    } else if (query.includes("jelaskan") || query.includes("apa") || query.includes("what")) {
      category = "explanation";
      complexity = "low";
      expectedSteps = 1;
      planningRequired = false;
    }

    // 2. Resolve needContext
    // General queries that do not reference any workspace/filesystem context (no slashes, file extensions, edits, or commands)
    const mentionsFiles = /\b[a-zA-Z0-9_-]+\.[a-zA-Z0-9]{1,4}\b/.test(query) || query.includes("/") || query.includes("\\");
    const isGeneralKnowledge = (query.includes("what is") || query.includes("apa itu") || query.includes("explain") || query.includes("jelaskan") || query.includes("definition") || query.includes("how does")) && !mentionsFiles && !isEdit && !isFeature && !isBugFix && !isRefactor;
    
    const needContext = !isGeneralKnowledge;

    return {
      category,
      complexity,
      expectedSteps,
      planningRequired,
      needContext,
    };
  }
}

export default new TaskAnalyzer();
