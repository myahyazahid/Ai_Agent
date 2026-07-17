// src/workspace/architectureAnalyzer.js

/**
 * Architectural roles a file or directory can occupy in a project.
 *
 * @typedef {"entry_point" | "bootstrap" | "config" | "core_engine" | "business_logic" | "service" | "utility" | "command" | "controller" | "model" | "route" | "middleware" | "planner" | "context" | "editing" | "type_definition" | "test" | "unknown"} ArchitecturalRole
 */

/**
 * @typedef {object} RoleMetadata
 * @property {string} purpose  - Human-readable description of the role's purpose.
 * @property {string} guideline - Editing guideline for the LLM to follow.
 */

/**
 * @typedef {object} FileArchitecture
 * @property {string} relativePath
 * @property {string} name
 * @property {ArchitecturalRole} role
 * @property {RoleMetadata} metadata
 */

/**
 * @typedef {object} ArchitectureMap
 * @property {FileArchitecture[]} files           - All classified files.
 * @property {string | null} entryPoint           - Detected entry point path.
 * @property {Record<ArchitecturalRole, string[]>} byRole - Paths grouped by role.
 * @property {Record<string, ArchitecturalRole>} roleIndex - Quick lookup: path → role.
 * @property {Record<string, string>} dirRoleIndex - Quick lookup: dir prefix → primary role.
 */

/**
 * Role metadata definitions — purpose and LLM editing guideline per role.
 *
 * @type {Record<ArchitecturalRole, RoleMetadata>}
 */
const ROLE_METADATA = {
  entry_point: {
    purpose: "Application bootstrap. Starts the process and initializes top-level components.",
    guideline:
      "NEVER place feature implementations here. Only add import or registration calls when integrating a newly created module.",
  },
  bootstrap: {
    purpose: "Secondary initialization file. Configures and wires application components.",
    guideline:
      "Avoid adding feature logic here. Prefer a dedicated service or module and import it from here if integration is required.",
  },
  config: {
    purpose: "Project or environment configuration.",
    guideline:
      "Only modify when changing configuration values. Never place business logic or feature implementations here.",
  },
  core_engine: {
    purpose: "Shared execution infrastructure used throughout the application.",
    guideline:
      "Only modify when changing fundamental cross-cutting behavior. Feature logic does not belong here.",
  },
  business_logic: {
    purpose: "Orchestrates higher-level application workflows and coordinates other modules.",
    guideline:
      "Feature orchestration and agent-level logic belongs here. Keep individual feature implementations in dedicated services.",
  },
  service: {
    purpose: "Encapsulates a specific business operation or external integration.",
    guideline:
      "Preferred location for new feature implementations. Create a dedicated service file for each feature area.",
  },
  utility: {
    purpose: "Small, reusable helper functions with no business logic of their own.",
    guideline:
      "Only add generic, stateless helpers here. Feature-specific logic belongs in a service.",
  },
  command: {
    purpose: "Executable commands or CLI tools exposed by the application.",
    guideline:
      "Add new commands as separate files in this directory. Keep each command focused on a single operation.",
  },
  controller: {
    purpose: "Request handlers that translate input into service calls and return responses.",
    guideline:
      "Controllers should be thin. Delegate business logic to services, not implement it here.",
  },
  model: {
    purpose: "Data structures, schemas, or ORM models.",
    guideline:
      "Add new models as separate files. Keep models free of business logic.",
  },
  route: {
    purpose: "Route definitions or tool/service registrations.",
    guideline:
      "Register new routes or tools here. Keep routing logic minimal — delegate to controllers or services.",
  },
  middleware: {
    purpose: "Cross-cutting concerns applied across requests or operations (e.g. auth, logging).",
    guideline:
      "New cross-cutting features (authentication, validation) belong here as separate middleware files.",
  },
  planner: {
    purpose: "Planning and task decomposition logic for the agent.",
    guideline:
      "Only modify when changing how tasks are analyzed or planned. Feature implementations do not belong here.",
  },
  context: {
    purpose: "Context assembly and relevance scoring for the agent.",
    guideline:
      "Only modify when changing how context is selected or ranked.",
  },
  editing: {
    purpose: "Code editing and patching infrastructure.",
    guideline:
      "Only modify when changing how edits are applied or validated.",
  },
  type_definition: {
    purpose: "TypeScript/JSDoc type definitions and interfaces.",
    guideline:
      "Add new type definitions here. Never place executable logic in type files.",
  },
  test: {
    purpose: "Automated tests for the project.",
    guideline:
      "Add test files alongside or within the test directory. Keep test logic separate from source.",
  },
  unknown: {
    purpose: "File with no clearly detected architectural role.",
    guideline:
      "Inspect the file before modifying it to understand its purpose. Create a dedicated module if implementing a new feature.",
  },
};

/**
 * Directory-prefix-to-role heuristics.
 * Checked after entry point detection — more specific paths first.
 *
 * @type {Array<{ prefix: string, role: ArchitecturalRole }>}
 */
const DIRECTORY_ROLE_HINTS = [
  { prefix: "src/middleware", role: "middleware" },
  { prefix: "middleware", role: "middleware" },
  { prefix: "src/controllers", role: "controller" },
  { prefix: "src/controller", role: "controller" },
  { prefix: "controllers", role: "controller" },
  { prefix: "src/models", role: "model" },
  { prefix: "src/model", role: "model" },
  { prefix: "models", role: "model" },
  { prefix: "src/routes", role: "route" },
  { prefix: "src/route", role: "route" },
  { prefix: "src/registry", role: "route" },
  { prefix: "routes", role: "route" },
  { prefix: "src/services", role: "service" },
  { prefix: "src/service", role: "service" },
  { prefix: "services", role: "service" },
  { prefix: "src/commands", role: "command" },
  { prefix: "src/command", role: "command" },
  { prefix: "src/tools", role: "command" },
  { prefix: "commands", role: "command" },
  { prefix: "src/utils", role: "utility" },
  { prefix: "src/util", role: "utility" },
  { prefix: "src/helpers", role: "utility" },
  { prefix: "utils", role: "utility" },
  { prefix: "helpers", role: "utility" },
  { prefix: "src/types", role: "type_definition" },
  { prefix: "src/type", role: "type_definition" },
  { prefix: "types", role: "type_definition" },
  { prefix: "src/agents", role: "business_logic" },
  { prefix: "src/agent", role: "business_logic" },
  { prefix: "agents", role: "business_logic" },
  { prefix: "src/core", role: "core_engine" },
  { prefix: "core", role: "core_engine" },
  { prefix: "src/planner", role: "planner" },
  { prefix: "src/planners", role: "planner" },
  { prefix: "planner", role: "planner" },
  { prefix: "src/context", role: "context" },
  { prefix: "context", role: "context" },
  { prefix: "src/editing", role: "editing" },
  { prefix: "editing", role: "editing" },
  { prefix: "src/decision", role: "planner" },
  { prefix: "decision", role: "planner" },
  { prefix: "src/providers", role: "service" },
  { prefix: "providers", role: "service" },
  { prefix: "test", role: "test" },
  { prefix: "tests", role: "test" },
  { prefix: "__tests__", role: "test" },
  { prefix: "spec", role: "test" },
];

/**
 * File name patterns that signal specific roles.
 *
 * @type {Array<{ pattern: RegExp, role: ArchitecturalRole }>}
 */
const NAME_ROLE_HINTS = [
  { pattern: /\.(test|spec)\.[jt]s$/, role: "test" },
  { pattern: /^(server|bootstrap)\.[jt]s$/, role: "bootstrap" },
  { pattern: /^(app)\.[jt]s$/, role: "bootstrap" },
  { pattern: /\.(config)\.[jt]s$/, role: "config" },
  { pattern: /^(\.env|\.env\..+|package\.json|tsconfig\.json|jsconfig\.json)$/, role: "config" },
  { pattern: /^(logger|log)\.[jt]s$/, role: "utility" },
];

/**
 * Classifies every file in the workspace by its architectural role.
 *
 * Role inference priority:
 *   1. Detected entry point match → entry_point
 *   2. package.json scripts.dev / main reference → entry_point or bootstrap
 *   3. Explicit name pattern (test files, config files, etc.)
 *   4. Directory prefix heuristic
 *   5. Unknown
 */
export class ArchitectureAnalyzer {
  /**
   * Analyze the workspace and produce a full architecture map.
   *
   * @param {object} scanResult
   * @param {Array<{relativePath: string, name: string}>} scanResult.files
   * @param {object} projectInfo
   * @param {string | null} projectInfo.framework
   * @param {string | null} entryPoint - Detected entry point (relative path).
   * @returns {ArchitectureMap}
   */
  analyze(scanResult, projectInfo, entryPoint) {
    const files = scanResult.files ?? [];

    /** @type {FileArchitecture[]} */
    const classified = [];

    /** @type {Record<ArchitecturalRole, string[]>} */
    const byRole = /** @type {any} */ ({});

    /** @type {Record<string, ArchitecturalRole>} */
    const roleIndex = {};

    for (const file of files) {
      const role = this._classifyFile(file, entryPoint, projectInfo);
      const metadata = ROLE_METADATA[role];

      classified.push({ relativePath: file.relativePath, name: file.name, role, metadata });

      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(file.relativePath);
      roleIndex[file.relativePath] = role;
    }

    const dirRoleIndex = this._buildDirRoleIndex(classified);

    return {
      files: classified,
      entryPoint: entryPoint ?? null,
      byRole,
      roleIndex,
      dirRoleIndex,
    };
  }

  /**
   * Classify a single file into an architectural role.
   *
   * @param {{ relativePath: string, name: string }} file
   * @param {string | null} entryPoint
   * @param {{ framework: string | null }} projectInfo
   * @returns {ArchitecturalRole}
   */
  _classifyFile(file, entryPoint, projectInfo) {
    const rel = file.relativePath.replace(/\\/g, "/");
    const name = file.name;

    // 1. Entry point match — highest priority
    if (entryPoint && rel === entryPoint.replace(/\\/g, "/")) {
      return "entry_point";
    }

    // 2. Name pattern hints (test, config, logger, etc.)
    for (const hint of NAME_ROLE_HINTS) {
      if (hint.pattern.test(name)) {
        return hint.role;
      }
    }

    // 3. Directory prefix heuristics — longer prefixes matched first (already ordered)
    for (const hint of DIRECTORY_ROLE_HINTS) {
      if (rel.startsWith(hint.prefix + "/") || rel === hint.prefix) {
        return hint.role;
      }
    }

    // 4. Root-level JS/TS file that looks like a bootstrap (index, main, app, server)
    if (!rel.includes("/")) {
      if (/^(index|main)\.[jt]s$/.test(name)) return "entry_point";
      if (/^(app|server|bootstrap)\.[jt]s$/.test(name)) return "bootstrap";
    }

    return "unknown";
  }

  /**
   * Build a directory-to-role index from classified files.
   * Useful for consumers needing to know a directory's dominant role.
   *
   * @param {FileArchitecture[]} classified
   * @returns {Record<string, ArchitecturalRole>}
   */
  _buildDirRoleIndex(classified) {
    /** @type {Map<string, Map<ArchitecturalRole, number>>} */
    const dirCounts = new Map();

    for (const f of classified) {
      const dir = f.relativePath.includes("/")
        ? f.relativePath.substring(0, f.relativePath.lastIndexOf("/"))
        : ".";

      if (!dirCounts.has(dir)) dirCounts.set(dir, new Map());
      const roleCounts = dirCounts.get(dir);
      roleCounts.set(f.role, (roleCounts.get(f.role) ?? 0) + 1);
    }

    /** @type {Record<string, ArchitecturalRole>} */
    const index = {};

    for (const [dir, roleCounts] of dirCounts) {
      let topRole = "unknown";
      let topCount = 0;

      for (const [role, count] of roleCounts) {
        if (count > topCount) {
          topRole = role;
          topCount = count;
        }
      }

      index[dir] = topRole;
    }

    return index;
  }

  /**
   * Get all files classified under a given role.
   *
   * @param {ArchitecturalRole} role
   * @param {ArchitectureMap} architectureMap
   * @returns {FileArchitecture[]}
   */
  getFilesForRole(role, architectureMap) {
    return architectureMap.files.filter((f) => f.role === role);
  }

  /**
   * Get the role metadata (purpose + guideline) for a given role.
   *
   * @param {ArchitecturalRole} role
   * @returns {RoleMetadata}
   */
  getRoleMetadata(role) {
    return ROLE_METADATA[role] ?? ROLE_METADATA.unknown;
  }

  /**
   * Get a map of role → suggested directory based on what exists in the workspace.
   * Returns directories that are already used for that role.
   *
   * @param {ArchitectureMap} architectureMap
   * @returns {Record<ArchitecturalRole, string | null>}
   */
  getSuggestedDirectories(architectureMap) {
    /** @type {Record<string, string | null>} */
    const result = {};

    for (const [role, paths] of Object.entries(architectureMap.byRole)) {
      if (paths.length === 0) {
        result[role] = null;
        continue;
      }
      // Use the directory of the first file found for this role
      const firstPath = paths[0];
      const dir = firstPath.includes("/")
        ? firstPath.substring(0, firstPath.lastIndexOf("/"))
        : ".";
      result[role] = dir;
    }

    return result;
  }
}

export default new ArchitectureAnalyzer();
