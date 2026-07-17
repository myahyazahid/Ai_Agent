// src/editing/fileEditor.js

/**
 * Applies a canonical Patch object to the original content, producing updatedContent.
 *
 * Implements logic for INSERT_AFTER, INSERT_BEFORE, REPLACE_BLOCK, APPEND, PREPEND, etc.
 * Preserves formatting and whitespace indentation matching the target lines.
 */
export class FileEditor {
  /**
   * Edit the original content by applying the patch.
   *
   * @param {string} originalContent
   * @param {object} patch - Canonical Patch object.
   * @returns {string} The modified/updated content.
   */
  edit(originalContent, patch) {
    if (patch.operation === "CREATE") {
      return patch.insertedCode;
    }

    const lines = originalContent.split("\n");

    // 1. Prepend
    if (patch.operation === "PREPEND") {
      return this.prepend(lines, patch.insertedCode);
    }

    // 2. Append
    if (patch.operation === "APPEND") {
      return this.append(lines, patch.insertedCode);
    }

    // Find the target line index
    let targetIndex = -1;
    if (patch.location) {
      targetIndex = patch.location.line - 1;
    } else if (patch.removedCode) {
      // Find line containing the block
      targetIndex = lines.findIndex((line) => line.includes(patch.removedCode.split("\n")[0]));
    }

    if (targetIndex === -1) {
      // Fallback to append if target not found
      return this.append(lines, patch.insertedCode);
    }

    const targetLine = lines[targetIndex];
    // Copy the target line's leading whitespace to preserve indentation formatting
    const indentMatch = targetLine.match(/^(\s*)/);
    const indentation = indentMatch ? indentMatch[1] : "";

    const indentedCode = this.applyIndentation(patch.insertedCode, indentation);

    // 3. Replace Block / Replace Text
    if (patch.operation === "REPLACE_BLOCK" || patch.operation === "REPLACE_TEXT") {
      // Calculate how many lines the original block spanned
      const removedLinesCount = patch.removedCode ? patch.removedCode.split("\n").length : 1;
      return this.replaceBlock(lines, targetIndex, removedLinesCount, indentedCode);
    }

    // 4. Insert After
    if (patch.operation === "INSERT_AFTER") {
      return this.insertAfter(lines, targetIndex, indentedCode);
    }

    // 5. Insert Before
    if (patch.operation === "INSERT_BEFORE") {
      return this.insertBefore(lines, targetIndex, indentedCode);
    }

    return originalContent;
  }

  /**
   * Prepend content.
   *
   * @param {string[]} lines
   * @param {string} code
   * @returns {string}
   */
  prepend(lines, code) {
    return `${code}\n${lines.join("\n")}`;
  }

  /**
   * Append content.
   *
   * @param {string[]} lines
   * @param {string} code
   * @returns {string}
   */
  append(lines, code) {
    const trailingNewline = lines.length > 0 && lines[lines.length - 1] === "" ? "" : "\n";
    return `${lines.join("\n")}${trailingNewline}${code}`;
  }

  /**
   * Insert code after target line.
   *
   * @param {string[]} lines
   * @param {number} index
   * @param {string} code
   * @returns {string}
   */
  insertAfter(lines, index, code) {
    const before = lines.slice(0, index + 1);
    const after = lines.slice(index + 1);
    return [...before, code, ...after].join("\n");
  }

  /**
   * Insert code before target line.
   *
   * @param {string[]} lines
   * @param {number} index
   * @param {string} code
   * @returns {string}
   */
  insertBefore(lines, index, code) {
    const before = lines.slice(0, index);
    const after = lines.slice(index);
    return [...before, code, ...after].join("\n");
  }

  /**
   * Replace a block of lines.
   *
   * @param {string[]} lines
   * @param {number} index
   * @param {number} lineCount
   * @param {string} code
   * @returns {string}
   */
  replaceBlock(lines, index, lineCount, code) {
    const before = lines.slice(0, index);
    const after = lines.slice(index + lineCount);
    return [...before, code, ...after].join("\n");
  }

  /**
   * Adjust indentation of code blocks.
   *
   * @param {string} code
   * @param {string} indentation
   * @returns {string}
   */
  applyIndentation(code, indentation) {
    if (!indentation) {
      return code;
    }

    return code
      .split("\n")
      .map((line, idx) => (idx === 0 || !line.trim() ? line : `${indentation}${line}`))
      .join("\n");
  }
}

export default new FileEditor();
