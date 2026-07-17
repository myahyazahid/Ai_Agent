// src/editing/editingEngine.js

import { readFile, writeFile, copyFile, unlink } from "node:fs/promises";
import path from "node:path";
import eventBus from "../core/eventBus.js";
import editStrategyResolver from "./editStrategyResolver.js";
import editPlanner from "./editPlanner.js";
import patchGenerator from "./patchGenerator.js";
import fileEditor from "./fileEditor.js";
import diffGenerator from "./diffGenerator.js";
import editValidator from "./editValidator.js";
import editCache from "./editCache.js";

/**
 * @typedef {object} EditResult
 * @property {string} originalFile - File path edited
 * @property {object} editPlan - Chosen strategy details
 * @property {object} patch - Canonical Patch object representation
 * @property {string} updatedContent - Resulting code content
 * @property {{ valid: boolean, warnings: string[], errors: string[] }} validation - Validation results
 * @property {string} diff - Unified colorized diff string
 */

/**
 * Public facade of the Editing Engine.
 * Responsible for orchestrating safe, incremental modifications.
 *
 * Implements preview mode and backup/rollback policy.
 */
export class EditingEngine {
  /**
   * @param {object} [options]
   * @param {string} [options.workspaceRoot]
   * @param {import("./editStrategyResolver.js").EditStrategyResolver} [options.resolver]
   * @param {import("./editPlanner.js").EditPlanner} [options.planner]
   * @param {import("./patchGenerator.js").PatchGenerator} [options.patchGenerator]
   * @param {import("./fileEditor.js").FileEditor} [options.editor]
   * @param {import("./diffGenerator.js").DiffGenerator} [options.diffGenerator]
   * @param {import("./editValidator.js").EditValidator} [options.validator]
   * @param {import("./editCache.js").EditCache} [options.cache]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({
    workspaceRoot = process.cwd(),
    resolver = editStrategyResolver,
    planner = editPlanner,
    patchGenerator: gen = patchGenerator,
    editor = fileEditor,
    diffGenerator: diffGen = diffGenerator,
    validator = editValidator,
    cache = editCache,
    eventBus: engineEventBus = eventBus,
  } = {}) {
    this.workspaceRoot = workspaceRoot;
    this.resolver = resolver;
    this.planner = planner;
    this.patchGenerator = gen;
    this.editor = editor;
    this.diffGenerator = diffGen;
    this.validator = validator;
    this.cache = cache;
    this.eventBus = engineEventBus;
  }

  /**
   * Apply an edit using the safe incremental pipeline.
   *
   * @param {object} params
   * @param {object} params.request - Structured edit request: { text, proposedContent }.
   * @param {object} params.workspace - Project metadata from WorkspaceService.
   * @param {string} params.targetFile - Absolute or relative path of file to edit.
   * @param {boolean} [params.preview] - Set to true to generate diff/patch without writing.
   * @returns {Promise<EditResult>}
   */
  async applyEdit({ request, workspace, targetFile, preview = false }) {
    const resolvedPath = path.isAbsolute(targetFile)
      ? path.resolve(targetFile)
      : path.resolve(this.workspaceRoot, targetFile);

    this.emitStatus("Reading target file", {
      phase: "editing:reading",
      path: resolvedPath,
    });

    let originalContent = "";
    let fileExists = false;

    try {
      originalContent = await readFile(resolvedPath, "utf8");
      fileExists = true;
    } catch {
      // File does not exist yet (Creation strategy)
    }

    // 1. Resolve strategy blocks (route/function/import)
    this.emitStatus("Resolving edit strategy references", {
      phase: "editing:planning",
    });
    const resolvedBlock = this.resolver.resolve(originalContent, request.text);

    // 2. Plan modification
    const plan = this.planner.plan(originalContent, request, resolvedBlock);

    // 3. Generate canonical patch
    this.emitStatus("Generating minimal code patch", {
      phase: "editing:patch",
    });
    const patch = this.patchGenerator.generate(originalContent, plan);

    // 4. Generate diff
    const diff = this.diffGenerator.generate(patch);

    // 5. Apply patch to generate updatedContent
    const updatedContent = this.editor.edit(originalContent, patch);

    // 6. Validate updated content
    this.emitStatus("Validating syntax and duplicates", {
      phase: "editing:validating",
      path: resolvedPath,
    });
    const validation = this.validator.validate(updatedContent, resolvedPath, originalContent);

    const editResult = {
      originalFile: resolvedPath,
      editPlan: plan,
      patch,
      updatedContent,
      validation,
      diff,
    };

    // Cache the result for inspect commands
    this.cache.saveLastEdit(editResult);

    if (preview) {
      this.emitStatus("Preview compiled (skipping write)", {
        phase: "editing:done",
        preview: true,
      });
      return editResult;
    }

    if (!validation.valid) {
      throw new Error(`Validation failed:\n${validation.errors.join("\n")}`);
    }

    // 7. Write updated content using backup & rollback workflow
    this.emitStatus("Writing file content", {
      phase: "editing:writing",
      path: resolvedPath,
    });

    await this.safeWrite(resolvedPath, updatedContent, fileExists);

    this.emitStatus("Edit complete", {
      phase: "editing:done",
      path: resolvedPath,
    });

    return editResult;
  }

  /**
   * Helper to write files with disk backup (.bak) rollback protection.
   *
   * @param {string} filePath
   * @param {string} content
   * @param {boolean} fileExists
   * @returns {Promise<void>}
   * @private
   */
  async safeWrite(filePath, content, fileExists) {
    const backupPath = `${filePath}.bak`;

    if (fileExists) {
      // Backup original
      await copyFile(filePath, backupPath);
    }

    try {
      await writeFile(filePath, content, "utf8");

      // Post-write validation check to ensure integrity
      const verification = await readFile(filePath, "utf8");
      if (verification !== content) {
        throw new Error("Wrote content verification mismatch");
      }

      if (fileExists) {
        // Delete backup
        await unlink(backupPath);
      }
    } catch (writeError) {
      if (fileExists) {
        // Rollback original
        await copyFile(backupPath, filePath);
        await unlink(backupPath);
      }
      throw new Error(`Rollback triggered. Write failed: ${writeError instanceof Error ? writeError.message : "Disk IO Error"}`);
    }
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
      source: "editingEngine",
      ...payload,
    });
  }
}

export default new EditingEngine();
