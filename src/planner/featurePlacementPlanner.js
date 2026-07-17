// src/planner/featurePlacementPlanner.js

/**
 * @typedef {object} PlacementResult
 * @property {string} implementationTarget  - Relative path where the feature should be implemented.
 * @property {string | null} integrationTarget - Entry point path to add an import, or null if not needed.
 * @property {string} targetRole            - Architectural role of the implementation target.
 * @property {string} reasoning             - Human-readable explanation of the placement decision.
 * @property {boolean} isNewFile            - Whether implementationTarget is a new file to be created.
 */

/**
 * Keyword → preferred architectural role mapping.
 * More specific keyword sets are listed first.
 *
 * @type {Array<{ keywords: string[], role: string, dirHint: string }>}
 */
const FEATURE_ROLE_MAP = [
  // Authentication / Authorization
  {
    keywords: ["auth", "login", "logout", "register", "signup", "password", "session", "token", "jwt", "credential"],
    role: "service",
    dirHint: "auth",
  },
  // HTTP Middleware
  {
    keywords: ["middleware", "interceptor", "guard", "cors", "helmet", "rate-limit", "ratelimit"],
    role: "middleware",
    dirHint: "middleware",
  },
  // Routing / Endpoints
  {
    keywords: ["route", "endpoint", "api", "rest", "graphql", "handler"],
    role: "route",
    dirHint: "routes",
  },
  // Database / Models
  {
    keywords: ["model", "schema", "entity", "table", "collection", "database", "migration", "seed"],
    role: "model",
    dirHint: "models",
  },
  // CLI commands
  {
    keywords: ["command", "cmd", "cli", "script"],
    role: "command",
    dirHint: "commands",
  },
  // Controllers
  {
    keywords: ["controller", "handler"],
    role: "controller",
    dirHint: "controllers",
  },
  // Utilities / Helpers
  {
    keywords: ["util", "helper", "format", "parse", "validate", "sanitize"],
    role: "utility",
    dirHint: "utils",
  },
  // Generic services / features
  {
    keywords: ["service", "provider", "integration", "client", "connector", "feature", "implement"],
    role: "service",
    dirHint: "services",
  },
];

/**
 * Decides WHERE a feature should be implemented, given an architecture map.
 *
 * This is the only component responsible for answering:
 *   "Which file should the new implementation live in?"
 *
 * Responsibilities:
 *   - Detect if an existing module already covers this feature area.
 *   - Map feature keywords to the correct architectural role.
 *   - Infer the best directory from what already exists in the workspace.
 *   - Enforce the entry-point protection rule.
 *   - Return a distinct integrationTarget when an import is needed.
 */
export class FeaturePlacementPlanner {
  /**
   * Determine the correct implementation target and optional integration target
   * for a given feature request.
   *
   * @param {string} requestText - The user's feature request.
   * @param {import("../workspace/architectureAnalyzer.js").ArchitectureMap | null} architectureMap
   * @param {object | null} workspaceData - Full workspace data from WorkspaceService.
   * @returns {PlacementResult}
   */
  plan(requestText, architectureMap, workspaceData) {
    const query = (requestText || "").toLowerCase();
    const entryPoint = architectureMap?.entryPoint ?? workspaceData?.entryPoint ?? null;

    // 1. Match keywords → desired role + directory hint
    const featureMatch = this._matchFeatureRole(query);
    const desiredRole = featureMatch?.role ?? "service";
    const desiredDirHint = featureMatch?.dirHint ?? "services";

    // 2. Check if an existing file already covers this feature area
    const existingFile = this._findExistingModule(query, desiredRole, architectureMap);
    if (existingFile) {
      return {
        implementationTarget: existingFile.relativePath,
        integrationTarget: null,
        targetRole: existingFile.role,
        reasoning: `Existing module found at '${existingFile.relativePath}' — targeting it for incremental edit.`,
        isNewFile: false,
      };
    }

    // 3. Resolve preferred directory from architecture map
    const preferredDir = this._resolvePreferredDirectory(desiredRole, desiredDirHint, architectureMap, workspaceData);

    // 4. Build the implementation file path
    const featureName = this._extractFeatureName(query, featureMatch?.keywords ?? []);
    const implementationTarget = `${preferredDir}/${featureName}.js`;

    // 5. Entry point protection
    //    If, somehow, resolution landed on the entry point, redirect to a dedicated module.
    const isLandingOnEntryPoint =
      entryPoint &&
      (implementationTarget === entryPoint || preferredDir === entryPoint);

    if (isLandingOnEntryPoint) {
      const safeDir = this._fallbackDirectory(desiredDirHint, workspaceData);
      const safePath = `${safeDir}/${featureName}.js`;

      return {
        implementationTarget: safePath,
        integrationTarget: entryPoint,
        targetRole: desiredRole,
        reasoning: `Redirected from entry point '${entryPoint}' to dedicated module '${safePath}'. Entry point will receive only an import.`,
        isNewFile: true,
      };
    }

    // 6. Determine whether an integration step (import in entry point) is needed
    //    Only add one if a recognized entry point exists and the feature introduces
    //    a new top-level module (service, middleware, command).
    const needsIntegration = this._requiresIntegration(desiredRole, entryPoint);

    return {
      implementationTarget,
      integrationTarget: needsIntegration ? entryPoint : null,
      targetRole: desiredRole,
      reasoning: `No existing '${desiredRole}' module matches '${featureName}'. Creating '${implementationTarget}'.${needsIntegration ? ` Entry point '${entryPoint}' will receive an import.` : ""}`,
      isNewFile: true,
    };
  }

  /**
   * Match the first feature role entry whose keywords appear in the query.
   *
   * @param {string} query
   * @returns {{ role: string, dirHint: string, keywords: string[] } | null}
   */
  _matchFeatureRole(query) {
    for (const entry of FEATURE_ROLE_MAP) {
      if (entry.keywords.some((kw) => query.includes(kw))) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Search the architecture map for an existing file that likely handles this feature.
   * Looks for name similarity within the desired role's file list.
   *
   * @param {string} query
   * @param {string} desiredRole
   * @param {import("../workspace/architectureAnalyzer.js").ArchitectureMap | null} architectureMap
   * @returns {import("../workspace/architectureAnalyzer.js").FileArchitecture | null}
   */
  _findExistingModule(query, desiredRole, architectureMap) {
    if (!architectureMap) return null;

    const filesForRole = architectureMap.files.filter((f) => f.role === desiredRole);
    const keywords = query.split(/\s+/).filter((w) => w.length > 3);

    for (const file of filesForRole) {
      const fileName = file.name.toLowerCase().replace(/\.[jt]s$/, "");
      if (keywords.some((kw) => fileName.includes(kw) || kw.includes(fileName))) {
        return file;
      }
    }

    return null;
  }

  /**
   * Resolve the best directory to place the new file, preferring directories
   * that already exist for the desired role.
   *
   * @param {string} desiredRole
   * @param {string} desiredDirHint
   * @param {import("../workspace/architectureAnalyzer.js").ArchitectureMap | null} architectureMap
   * @param {object | null} workspaceData
   * @returns {string}
   */
  _resolvePreferredDirectory(desiredRole, desiredDirHint, architectureMap, workspaceData) {
    if (architectureMap) {
      // Use the directory of existing files for this role
      const filesForRole = architectureMap.files.filter((f) => f.role === desiredRole);
      if (filesForRole.length > 0) {
        const firstPath = filesForRole[0].relativePath;
        if (firstPath.includes("/")) {
          return firstPath.substring(0, firstPath.lastIndexOf("/"));
        }
      }
    }

    // Infer from workspace tree whether src/ or root is the convention
    const hasSrcDir = architectureMap?.files.some((f) => f.relativePath.startsWith("src/")) ?? false;
    const base = hasSrcDir ? "src" : ".";

    return `${base}/${desiredDirHint}`;
  }

  /**
   * Extract a short, descriptive file name from the feature request.
   *
   * @param {string} query
   * @param {string[]} matchedKeywords
   * @returns {string}
   */
  _extractFeatureName(query, matchedKeywords) {
    // Find the first matched keyword that appears in the query — use as file name basis
    for (const kw of matchedKeywords) {
      if (query.includes(kw) && kw.length > 2) {
        return kw.replace(/[^a-z0-9]/g, "");
      }
    }

    // Fallback: take the first meaningful word from the query
    const words = query
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    return words[0] ?? "feature";
  }

  /**
   * Determine if this feature role typically needs an import in the entry point.
   * Middleware and services that register themselves on startup do; utilities do not.
   *
   * @param {string} role
   * @param {string | null} entryPoint
   * @returns {boolean}
   */
  _requiresIntegration(role, entryPoint) {
    if (!entryPoint) return false;
    const integratingRoles = new Set(["service", "middleware", "route", "command", "business_logic"]);
    return integratingRoles.has(role);
  }

  /**
   * Safe fallback directory that is guaranteed not to be the entry point.
   *
   * @param {string} desiredDirHint
   * @param {object | null} workspaceData
   * @returns {string}
   */
  _fallbackDirectory(desiredDirHint, workspaceData) {
    const hasSrc = workspaceData?.workspaceTree?.children?.some?.((c) => c.name === "src") ?? false;
    const base = hasSrc ? "src" : ".";
    return `${base}/${desiredDirHint}`;
  }
}

export default new FeaturePlacementPlanner();
