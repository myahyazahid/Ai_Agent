// src/workspace/workspaceScanner.js

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import eventBus from "../core/eventBus.js";
import ignoreManager from "./ignoreManager.js";

/**
 * Extension-to-language mapping for common file types.
 * @type {Record<string, string>}
 */
const EXTENSION_LANGUAGE_MAP = {
  ".js": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".jsx": "JavaScript",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".py": "Python",
  ".rb": "Ruby",
  ".php": "PHP",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".go": "Go",
  ".rs": "Rust",
  ".cs": "C#",
  ".c": "C",
  ".cpp": "C++",
  ".h": "C",
  ".hpp": "C++",
  ".swift": "Swift",
  ".dart": "Dart",
  ".lua": "Lua",
  ".r": "R",
  ".scala": "Scala",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".hs": "Haskell",
  ".html": "HTML",
  ".htm": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sass": "Sass",
  ".less": "Less",
  ".json": "JSON",
  ".yaml": "YAML",
  ".yml": "YAML",
  ".toml": "TOML",
  ".xml": "XML",
  ".md": "Markdown",
  ".sql": "SQL",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".ps1": "PowerShell",
  ".bat": "Batch",
  ".cmd": "Batch",
  ".vue": "Vue",
  ".svelte": "Svelte",
};

/**
 * Recursively scans a workspace directory tree, collecting file and directory
 * metadata without reading file contents.
 *
 * Delegates ignore decisions to IgnoreManager so the scanning rules remain
 * centralized and extensible.
 */
export class WorkspaceScanner {
  /**
   * @param {object} [options]
   * @param {import("./ignoreManager.js").IgnoreManager} [options.ignoreManager]
   * @param {import("../core/eventBus.js").AgentEventBus} [options.eventBus]
   */
  constructor({
    ignoreManager: ignore = ignoreManager,
    eventBus: scannerEventBus = eventBus,
  } = {}) {
    this.ignoreManager = ignore;
    this.eventBus = scannerEventBus;
  }

  /**
   * Scan a workspace root and return structured metadata.
   *
   * @param {string} root - Absolute path to the workspace root.
   * @returns {Promise<{
   *   root: string,
   *   files: Array<{
   *     path: string,
   *     relativePath: string,
   *     name: string,
   *     extension: string | null,
   *     size: number,
   *     mtime: Date,
   *     ctime: Date,
   *     language: string | null
   *   }>,
   *   directories: Array<{
   *     path: string,
   *     relativePath: string,
   *     name: string
   *   }>,
   *   tree: {
   *     name: string,
   *     type: "directory",
   *     children: Array<object>
   *   }
   * }>}
   */
  async scan(root) {
    const resolvedRoot = path.resolve(root);

    this.emitStatus("Scanning workspace", {
      phase: "workspace:scanning",
      root: resolvedRoot,
    });

    /** @type {Array<{path: string, relativePath: string, name: string, extension: string | null, size: number, mtime: Date, ctime: Date, language: string | null}>} */
    const files = [];

    /** @type {Array<{path: string, relativePath: string, name: string}>} */
    const directories = [];

    const tree = await this.scanDirectory(resolvedRoot, resolvedRoot, files, directories);

    return {
      root: resolvedRoot,
      files,
      directories,
      tree,
    };
  }

  /**
   * Recursively scan a single directory and build its tree node.
   *
   * @param {string} dirPath - Absolute path to the directory to scan.
   * @param {string} root - Absolute path to the workspace root.
   * @param {Array<object>} files - Accumulator for file entries.
   * @param {Array<object>} directories - Accumulator for directory entries.
   * @returns {Promise<{name: string, type: "directory", children: Array<object>}>}
   */
  async scanDirectory(dirPath, root, files, directories) {
    const name = dirPath === root ? path.basename(root) : path.basename(dirPath);
    const children = [];

    let entries;

    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return { name, type: "directory", children };
    }

    // Sort entries: directories first, then files, both alphabetically.
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(root, entryPath).split(path.sep).join("/");

      if (entry.isDirectory()) {
        if (this.ignoreManager.shouldIgnore(entry.name, "directory")) {
          continue;
        }

        directories.push({
          path: entryPath,
          relativePath,
          name: entry.name,
        });

        const childTree = await this.scanDirectory(entryPath, root, files, directories);
        children.push(childTree);
      } else if (entry.isFile()) {
        if (this.ignoreManager.shouldIgnore(entry.name, "file")) {
          continue;
        }

        const fileEntry = await this.createFileEntry(entryPath, relativePath, entry.name);

        if (fileEntry) {
          files.push(fileEntry);
          children.push({
            name: entry.name,
            type: "file",
          });
        }
      }
    }

    return { name, type: "directory", children };
  }

  /**
   * Create a file metadata entry by reading fs.stat.
   *
   * @param {string} filePath
   * @param {string} relativePath
   * @param {string} name
   * @returns {Promise<{
   *   path: string,
   *   relativePath: string,
   *   name: string,
   *   extension: string | null,
   *   size: number,
   *   mtime: Date,
   *   ctime: Date,
   *   language: string | null
   * } | null>}
   */
  async createFileEntry(filePath, relativePath, name) {
    try {
      const stats = await stat(filePath);
      const extension = this.extractExtension(name);

      return {
        path: filePath,
        relativePath,
        name,
        extension,
        size: stats.size,
        mtime: stats.mtime,
        ctime: stats.birthtime,
        language: this.detectLanguage(extension),
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract the file extension including the leading dot.
   *
   * @param {string} name
   * @returns {string | null}
   */
  extractExtension(name) {
    const dotIndex = name.lastIndexOf(".");

    if (dotIndex <= 0 || dotIndex === name.length - 1) {
      return null;
    }

    return name.slice(dotIndex).toLowerCase();
  }

  /**
   * Detect the programming language from a file extension.
   *
   * @param {string | null} extension
   * @returns {string | null}
   */
  detectLanguage(extension) {
    if (!extension) {
      return null;
    }

    return EXTENSION_LANGUAGE_MAP[extension] ?? null;
  }

  /**
   * Emit a status event to the shared event bus.
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
      source: "workspaceScanner",
      ...payload,
    });
  }
}

export default new WorkspaceScanner();
