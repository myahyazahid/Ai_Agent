// src/planner/projectInspector.js

/**
 * @typedef {object} CapabilitySummary
 * @property {string | null} framework - Detected project framework.
 * @property {string | null} entryPoint - Detected project entrypoint file.
 * @property {{
 *   authentication: "jwt" | "nextauth" | "none",
 *   routing: "express" | "next" | "none",
 *   database: "postgresql" | "mongodb" | "none",
 *   orm: "prisma" | "mongoose" | "none",
 *   testing: "jest" | "mocha" | "none"
 * }} capabilities - Project technical capabilities.
 * @property {number} confidence - Inspector confidence rating (0.0 to 1.0).
 */

/**
 * Inspects project capabilities using high-level structured data from WorkspaceService.
 * Avoids direct filesystem scanning.
 */
export class ProjectInspector {
  /**
   * Resolve capability summary.
   *
   * @param {object | null} workspaceData - Structured data from WorkspaceService.
   * @returns {CapabilitySummary}
   */
  inspect(workspaceData) {
    if (!workspaceData) {
      return {
        framework: null,
        entryPoint: null,
        capabilities: {
          authentication: "none",
          routing: "none",
          database: "none",
          orm: "none",
          testing: "none",
        },
        confidence: 0.5,
      };
    }

    const deps = workspaceData.dependencies || {};
    const framework = workspaceData.framework;
    const entryPoint = workspaceData.entryPoint;

    // 1. Resolve Authentication
    let authentication = "none";
    if (deps["jsonwebtoken"] || deps["jwt-simple"]) {
      authentication = "jwt";
    } else if (deps["next-auth"] || deps["@auth/core"]) {
      authentication = "nextauth";
    }

    // 2. Resolve Routing
    let routing = "none";
    if (deps["express"] || framework === "Express") {
      routing = "express";
    } else if (deps["next"] || framework === "Next.js") {
      routing = "next";
    }

    // 3. Resolve Database & ORM
    let database = "none";
    if (deps["pg"] || deps["pg-promise"]) {
      database = "postgresql";
    } else if (deps["mongodb"] || deps["mongoose"]) {
      database = "mongodb";
    }

    let orm = "none";
    if (deps["prisma"] || deps["@prisma/client"]) {
      orm = "prisma";
    } else if (deps["mongoose"]) {
      orm = "mongoose";
    }

    // 4. Resolve Testing
    let testing = "none";
    if (deps["jest"]) {
      testing = "jest";
    } else if (deps["mocha"]) {
      testing = "mocha";
    }

    // 5. Calculate Confidence Score
    let confidence = 0.5;
    if (framework && entryPoint) {
      confidence = 0.98;
    } else if (framework || entryPoint) {
      // Confidence is in 60-89% threshold (0.75). Inspect additional evidence (e.g., configFiles) to try and raise it
      const configFiles = workspaceData.configFiles || [];
      const hasConfig = configFiles.some(f => 
        f.toLowerCase().includes("config") || 
        f.toLowerCase().includes("package.json") ||
        f.toLowerCase().includes("tsconfig") ||
        f.toLowerCase().includes("jsconfig")
      );
      if (hasConfig) {
        confidence = 0.92; // Boost to >= 90% since config files confirm the framework
      } else {
        confidence = 0.75;
      }
    }

    return {
      framework,
      entryPoint,
      capabilities: {
        authentication,
        routing,
        database,
        orm,
        testing,
      },
      confidence,
    };
  }
}

export default new ProjectInspector();
