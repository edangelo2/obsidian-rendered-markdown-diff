/**
 * Splits a Markdown document into top-level blocks that can be rendered on
 * their own: frontmatter, headings, paragraphs, list items, block quotes and
 * callouts, tables, fenced code, math blocks, comments and rules.
 *
 * The split is line-based on purpose. It does not need to be a full Markdown
 * parser: it only has to cut the document at places where rendering each piece
 * separately gives the same result as rendering the whole note, so that the
 * diff can compare (and align) whole blocks.
 */

export type BlockKind =
  | 'frontmatter'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'quote'
  | 'table'
  | 'code'
  | 'math'
  | 'comment'
  | 'rule'
  | 'html';

export interface Block {
  kind: BlockKind;
  /** Raw Markdown of the block, without trailing blank lines. */
  text: string;
  /** 0-based first line in the source. */
  startLine: number;
  /** 0-based last line in the source (inclusive). */
  endLine: number;
}

const FENCE_RE = /^(\s{0,3})(`{3,}|~{3,})/;
const HEADING_RE = /^\s{0,3}#{1,6}(\s|$)/;
const LIST_ITEM_RE = /^\s{0,3}([-*+]|\d{1,9}[.)])(\s|$)/;
const QUOTE_RE = /^\s{0,3}>/;
const TABLE_RE = /^\s{0,3}\|/;
const RULE_RE = /^\s{0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/;
const SETEXT_RE = /^\s{0,3}(=+|-+)\s*$/;
const MATH_RE = /^\s*\$\$/;
const COMMENT_RE = /^\s*%%/;
const HTML_BLOCK_RE = /^\s{0,3}<(div|details|table|section|aside|figure|iframe|pre|!--)/i;

function isBlank(line: string): boolean {
  return line.trim() === '';
}

function isIndented(line: string): boolean {
  return /^( {2,}|\t)/.test(line);
}

/** True if the line opens a construct that interrupts a paragraph. */
function startsNewBlock(line: string): boolean {
  return (
    FENCE_RE.test(line) ||
    HEADING_RE.test(line) ||
    QUOTE_RE.test(line) ||
    MATH_RE.test(line) ||
    COMMENT_RE.test(line) ||
    RULE_RE.test(line) ||
    (LIST_ITEM_RE.test(line) && !isIndented(line))
  );
}

export function splitBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  const push = (kind: BlockKind, start: number, end: number) => {
    // Trim trailing blank lines from the block.
    while (end > start && isBlank(lines[end])) end--;
    blocks.push({ kind, text: lines.slice(start, end + 1).join('\n'), startLine: start, endLine: end });
  };

  // Frontmatter: only at the very top of the note.
  if (lines[0] === '---') {
    for (let j = 1; j < lines.length; j++) {
      if (lines[j] === '---' || lines[j] === '...') {
        push('frontmatter', 0, j);
        i = j + 1;
        break;
      }
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    // Fenced code block (``` or ~~~), until a closing fence of the same kind.
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[2];
      const start = i;
      i++;
      while (i < lines.length) {
        const close = new RegExp(`^\\s{0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`);
        if (close.test(lines[i])) break;
        i++;
      }
      push('code', start, Math.min(i, lines.length - 1));
      i++;
      continue;
    }

    // $$ math block. A single line like "$$x$$" is complete on its own.
    if (MATH_RE.test(line)) {
      const start = i;
      const rest = line.trim().slice(2);
      if (!rest.includes('$$')) {
        i++;
        while (i < lines.length && !lines[i].includes('$$')) i++;
      }
      push('math', start, Math.min(i, lines.length - 1));
      i++;
      continue;
    }

    // %% Obsidian comment %%.
    if (COMMENT_RE.test(line)) {
      const start = i;
      const rest = line.trim().slice(2);
      if (!rest.includes('%%')) {
        i++;
        while (i < lines.length && !lines[i].includes('%%')) i++;
      }
      push('comment', start, Math.min(i, lines.length - 1));
      i++;
      continue;
    }

    if (HEADING_RE.test(line)) {
      push('heading', i, i);
      i++;
      continue;
    }

    // A thematic break wins over a list item ("- - -" is a rule).
    if (RULE_RE.test(line)) {
      push('rule', i, i);
      i++;
      continue;
    }

    // Block quote / callout: contiguous lines starting with ">".
    if (QUOTE_RE.test(line)) {
      const start = i;
      i++;
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        // A new callout header starts a new block even without a blank line.
        if (/^\s{0,3}>\s*\[!/.test(lines[i])) break;
        i++;
      }
      push('quote', start, i - 1);
      continue;
    }

    // Table: contiguous lines starting with "|".
    if (TABLE_RE.test(line)) {
      const start = i;
      i++;
      while (i < lines.length && TABLE_RE.test(lines[i])) i++;
      push('table', start, i - 1);
      continue;
    }

    // List item: the item line plus its indented continuation (including
    // nested lists, even after a blank line). Each top-level item is a block.
    if (LIST_ITEM_RE.test(line)) {
      const start = i;
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) {
          // Continue only if the next non-blank line is indented (belongs to the item).
          let k = i + 1;
          while (k < lines.length && isBlank(lines[k])) k++;
          if (k < lines.length && isIndented(lines[k])) {
            i = k;
            continue;
          }
          break;
        }
        if (isIndented(l)) {
          i++;
          continue;
        }
        if (startsNewBlock(l) || TABLE_RE.test(l)) break;
        // Lazy continuation line of the item's paragraph.
        i++;
      }
      push('list', start, i - 1);
      continue;
    }

    if (HTML_BLOCK_RE.test(line)) {
      const start = i;
      i++;
      while (i < lines.length && !isBlank(lines[i])) i++;
      push('html', start, i - 1);
      continue;
    }

    // Paragraph: until a blank line or a line that starts another block.
    // A setext underline ("===" or "---") turns it into a heading.
    {
      const start = i;
      let kind: BlockKind = 'paragraph';
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (isBlank(l)) break;
        if (SETEXT_RE.test(l)) {
          kind = 'heading';
          i++;
          break;
        }
        if (startsNewBlock(l) || TABLE_RE.test(l)) break;
        i++;
      }
      push(kind, start, i - 1);
    }
  }

  return blocks;
}

/** Normalizes a block for comparison: trailing whitespace is not a change. */
export function normalizeBlock(text: string): string {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n');
}
