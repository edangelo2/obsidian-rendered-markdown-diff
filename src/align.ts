/**
 * Aligns the blocks of two versions of a note into rows for a side-by-side
 * view. Each row holds the old block on the left and the new block on the
 * right (either side may be empty), so rendering the rows in a grid keeps
 * both versions vertically aligned with a single scroll.
 */

import { diffArrays } from 'diff';
import DiffMatchPatch from 'diff-match-patch';
import { Block, normalizeBlock } from './blocks';

export type RowType =
  /** Same block on both sides. */
  | 'equal'
  /** The block was edited: same block, different content. Gets word-level highlights. */
  | 'modified'
  /** A block on each side, but unrelated: old one removed, new one added. */
  | 'replaced'
  /** Only in the old version. */
  | 'deleted'
  /** Only in the new version. */
  | 'inserted';

export interface Row {
  type: RowType;
  old?: Block;
  new?: Block;
}

/** Minimum similarity (0..1) for two blocks to be shown as one edited block. */
export const PAIR_THRESHOLD = 0.4;

const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 0.2;

/** Similarity of two strings in 0..1, from the characters they share. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const diffs = dmp.diff_main(a, b, false);
  let common = 0;
  for (const [op, text] of diffs) if (op === 0) common += text.length;
  return (2 * common) / (a.length + b.length);
}

function blockSimilarity(a: Block, b: Block): number {
  const s = similarity(normalizeBlock(a.text), normalizeBlock(b.text));
  // A heading that became a paragraph (or the like) is a weaker match.
  return a.kind === b.kind ? s : s * 0.8;
}

/**
 * Pairs the removed and added blocks of one change region.
 * Finds the monotonic matching with the highest total similarity (each pair
 * at or above the threshold), then fills the gaps between pairs.
 */
function pairRegion(removed: Block[], added: Block[], rows: Row[]): void {
  const m = removed.length;
  const n = added.length;

  // Very large regions: skip the quadratic matching and zip in order.
  if (m * n > 40000) {
    zip(removed, added, rows);
    return;
  }

  const sim: number[][] = removed.map((r) => added.map((a) => blockSimilarity(r, a)));
  // score[i][j]: best total for removed[0..i) and added[0..j).
  const score: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      let best = Math.max(score[i - 1][j], score[i][j - 1]);
      const s = sim[i - 1][j - 1];
      if (s >= PAIR_THRESHOLD) best = Math.max(best, score[i - 1][j - 1] + s);
      score[i][j] = best;
    }
  }

  // Backtrack to the list of pairs.
  const pairs: Array<[number, number]> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    const s = sim[i - 1][j - 1];
    if (s >= PAIR_THRESHOLD && score[i][j] === score[i - 1][j - 1] + s) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (score[i][j] === score[i - 1][j]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();

  let ri = 0;
  let ai = 0;
  for (const [pr, pa] of pairs) {
    zip(removed.slice(ri, pr), added.slice(ai, pa), rows);
    rows.push({ type: 'modified', old: removed[pr], new: added[pa] });
    ri = pr + 1;
    ai = pa + 1;
  }
  zip(removed.slice(ri), added.slice(ai), rows);
}

/** Unmatched blocks: side by side while both sides have one, then alone. */
function zip(removed: Block[], added: Block[], rows: Row[]): void {
  const k = Math.max(removed.length, added.length);
  for (let i = 0; i < k; i++) {
    const r = removed[i];
    const a = added[i];
    if (r && a) rows.push({ type: 'replaced', old: r, new: a });
    else if (r) rows.push({ type: 'deleted', old: r });
    else if (a) rows.push({ type: 'inserted', new: a });
  }
}

export function alignBlocks(oldBlocks: Block[], newBlocks: Block[]): Row[] {
  const oldKeys = oldBlocks.map((b) => normalizeBlock(b.text));
  const newKeys = newBlocks.map((b) => normalizeBlock(b.text));
  const changes = diffArrays(oldKeys, newKeys);

  const rows: Row[] = [];
  let oi = 0;
  let ni = 0;
  let removed: Block[] = [];
  let added: Block[] = [];

  const flush = () => {
    if (removed.length || added.length) pairRegion(removed, added, rows);
    removed = [];
    added = [];
  };

  for (const change of changes) {
    const count = change.value.length;
    if (change.removed) {
      removed.push(...oldBlocks.slice(oi, oi + count));
      oi += count;
    } else if (change.added) {
      added.push(...newBlocks.slice(ni, ni + count));
      ni += count;
    } else {
      flush();
      for (let k = 0; k < count; k++) {
        rows.push({ type: 'equal', old: oldBlocks[oi + k], new: newBlocks[ni + k] });
      }
      oi += count;
      ni += count;
    }
  }
  flush();
  return rows;
}

export interface ChangeGroup {
  /** Index of the first row of the group. */
  start: number;
  /** Index of the last row of the group (inclusive). */
  end: number;
}

/** Consecutive non-equal rows form one change, the unit of navigation. */
export function changeGroups(rows: Row[]): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].type === 'equal') continue;
    const start = i;
    while (i + 1 < rows.length && rows[i + 1].type !== 'equal') i++;
    groups.push({ start, end: i });
  }
  return groups;
}
