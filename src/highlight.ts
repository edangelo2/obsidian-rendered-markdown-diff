/**
 * Word-level highlighting on already rendered HTML.
 *
 * Instead of diffing the Markdown source and trying to map it into HTML, it
 * diffs the visible text of the two rendered blocks and wraps the changed
 * words in <span> elements. That way it works with anything the renderer
 * produces (wiki-links, callouts, embeds, tables) without knowing about it.
 */

import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 0.5;

/** Elements whose text is not compared word by word (rendered as a whole). */
const SKIP_SELECTOR = 'script, style, svg, mjx-container, .math, .mermaid, .frontmatter-container, iframe';

interface TextPiece {
  node: Text;
  start: number;
}

function collectText(root: HTMLElement): { text: string; pieces: TextPiece[] } {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const pieces: TextPiece[] = [];
  let text = '';
  let node = walker.nextNode() as Text | null;
  while (node) {
    const parent = node.parentElement;
    if (!parent || !parent.closest(SKIP_SELECTOR)) {
      pieces.push({ node, start: text.length });
      text += node.data;
    }
    node = walker.nextNode() as Text | null;
  }
  return { text, pieces };
}

const TOKEN_RE = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

/**
 * Diff of two texts at the level of words: each word, run of spaces or
 * punctuation sign is one token (encoded as one character for the diff).
 */
export function wordDiff(a: string, b: string): Array<[number, string]> {
  const tokenIndex = new Map<string, number>();
  const tokens: string[] = [];
  const encode = (s: string): string => {
    let out = '';
    for (const m of s.match(TOKEN_RE) ?? []) {
      let idx = tokenIndex.get(m);
      if (idx === undefined) {
        idx = tokens.length;
        tokens.push(m);
        tokenIndex.set(m, idx);
      }
      out += String.fromCharCode(idx + 0x100);
    }
    return out;
  };
  const ea = encode(a);
  const eb = encode(b);
  // Too many distinct tokens to encode as chars: fall back to a char diff.
  if (tokens.length > 0xf000) {
    const d = dmp.diff_main(a, b);
    dmp.diff_cleanupSemantic(d);
    return d.map(([op, t]) => [op, t]);
  }
  const diffs = dmp.diff_main(ea, eb, false);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, enc]) => {
    let t = '';
    for (let i = 0; i < enc.length; i++) t += tokens[enc.charCodeAt(i) - 0x100];
    return [op, t];
  });
}

/** Drops leading and trailing spaces from a range: only words get marked. */
function trimRange(text: string, s: number, e: number): [number, number] {
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  return [s, e];
}

function wrapRanges(pieces: TextPiece[], ranges: Array<[number, number]>, className: string): void {
  if (!ranges.length) return;
  for (const { node, start } of pieces) {
    const end = start + node.data.length;
    const local = ranges
      .filter(([s, e]) => s < end && e > start)
      .map(([s, e]) => [Math.max(s, start) - start, Math.min(e, end) - start] as [number, number]);
    // From last to first, so earlier offsets in the node stay valid.
    for (let k = local.length - 1; k >= 0; k--) {
      const [s, e] = local[k];
      if (!node.data.slice(s, e).trim()) continue;
      node.splitText(e);
      const mid = node.splitText(s);
      const span = node.ownerDocument.createElement('span');
      span.className = className;
      mid.parentNode!.insertBefore(span, mid);
      span.appendChild(mid);
    }
  }
}

export interface PairHighlight {
  /** Number of changed words marked on each side. */
  removed: number;
  added: number;
}

/**
 * Marks the words removed from `oldEl` and added in `newEl`.
 */
export function highlightPair(oldEl: HTMLElement, newEl: HTMLElement): PairHighlight {
  const a = collectText(oldEl);
  const b = collectText(newEl);
  const diffs = wordDiff(a.text, b.text);

  const delRanges: Array<[number, number]> = [];
  const insRanges: Array<[number, number]> = [];
  let ia = 0;
  let ib = 0;
  for (const [op, t] of diffs) {
    if (op === 0) {
      ia += t.length;
      ib += t.length;
    } else if (op === -1) {
      delRanges.push(trimRange(a.text, ia, ia + t.length));
      ia += t.length;
    } else {
      insRanges.push(trimRange(b.text, ib, ib + t.length));
      ib += t.length;
    }
  }
  const del = delRanges.filter(([s, e]) => e > s);
  const ins = insRanges.filter(([s, e]) => e > s);
  wrapRanges(a.pieces, del, 'rmd-word-del');
  wrapRanges(b.pieces, ins, 'rmd-word-ins');
  return { removed: del.length, added: ins.length };
}
