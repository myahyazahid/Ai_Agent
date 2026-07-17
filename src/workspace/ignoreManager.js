// src/workspace/ignoreManager.js

/**
 * Default directories excluded from workspace scanning.
 * @type {ReadonlySet<string>}
 */
const DEFAULT_IGNORED_DIRECTORIES = Object.freeze(new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".turbo",
  "coverage",
  "out",
  ".cache",
  "__pycache__",
  ".dart_tool",
  ".idea",
  ".vscode",
  "vendor",
  "target",
  ".gradle",
  ".parcel-cache",
  ".vercel",
  ".netlify",
  ".serverless",
  ".terraform",
  "bower_components",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  "eggs",
  "*.egg-info",
]));

/**
 * File extensions considered binary and excluded from scanning.
 * @type {ReadonlySet<string>}
 */
const DEFAULT_IGNORED_EXTENSIONS = Object.freeze(new Set([
  // Images
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".ico", ".webp", ".avif",
  // Fonts
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  // Audio / Video
  ".mp3", ".mp4", ".webm", ".ogg", ".wav", ".flac", ".avi", ".mov",
  // Archives
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".xz",
  // Executables / Compiled
  ".exe", ".dll", ".so", ".dylib", ".class", ".pyc", ".pyo", ".o", ".obj",
  // Data blobs
  ".sqlite", ".db", ".bin", ".dat",
  // Lock files (large, not useful for analysis)
  ".lock",
]));

/**
 * Centralized ignore-rule manager for workspace scanning.
 *
 * Determines which files and directories should be excluded from scanning.
 * Designed to be extended with .gitignore, .aiignore, .cursorignore, and
 * .clineignore support in the future without changing the public API.
 */
export class IgnoreManager {
  /**
   * @param {object} [options]
   * @param {Set<string>} [options.ignoredDirectories]
   * @param {Set<string>} [options.ignoredExtensions]
   * @param {string[]} [options.customRules]
   */
  constructor({
    ignoredDirectories = DEFAULT_IGNORED_DIRECTORIES,
    ignoredExtensions = DEFAULT_IGNORED_EXTENSIONS,
    customRules = [],
  } = {}) {
    /** @type {Set<string>} */
    this.ignoredDirectories = new Set(ignoredDirectories);

    /** @type {Set<string>} */
    this.ignoredExtensions = new Set(ignoredExtensions);

    /** @type {string[]} */
    this.customRules = [...customRules];
  }

  /**
   * Check whether a file or directory should be ignored.
   *
   * @param {string} name - The base name of the file or directory.
   * @param {"file" | "directory"} type
   * @returns {boolean}
   */
  shouldIgnore(name, type) {
    if (type === "directory") {
      return this.ignoredDirectories.has(name);
    }

    if (type === "file") {
      const extension = this.extractExtension(name);
      return extension !== null && this.ignoredExtensions.has(extension);
    }

    return false;
  }

  /**
   * Get the current set of ignored directory names.
   *
   * @returns {string[]}
   */
  getIgnoredDirectories() {
    return Array.from(this.ignoredDirectories);
  }

  /**
   * Get the current set of ignored file extensions.
   *
   * @returns {string[]}
   */
  getIgnoredExtensions() {
    return Array.from(this.ignoredExtensions);
  }

  /**
   * Add a custom ignore rule.
   *
   * For directories: pass the directory name directly.
   * For extensions: pass the extension with a leading dot (e.g., ".log").
   *
   * @param {string} rule
   * @param {"directory" | "extension"} type
   * @returns {void}
   */
  addRule(rule, type) {
    if (type === "directory") {
      this.ignoredDirectories.add(rule);
    } else if (type === "extension") {
      this.ignoredExtensions.add(rule);
    }

    this.customRules.push(`${type}:${rule}`);
  }

  /**
   * Extract the file extension from a filename, including the leading dot.
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
}

export default new IgnoreManager();
