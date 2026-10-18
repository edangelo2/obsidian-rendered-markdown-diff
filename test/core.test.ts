import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { splitBlocks } from '../src/blocks';
import { alignBlocks, changeGroups } from '../src/align';
import { highlightPair, wordDiff } from '../src/highlight';

const kinds = (md: string) => splitBlocks(md).map((b) => b.kind);
const texts = (md: string) => splitBlocks(md).map((b) => b.text);

test('frontmatter, headings, paragraphs', () => {
  const md = '---\ntitle: x\ntags: [a]\n---\n# Title\n\nPara one\nstill one\n\nPara two\n\nSetext\n---\n';
  assert.deepEqual(kinds(md), ['frontmatter', 'heading', 'paragraph', 'paragraph', 'heading']);
  assert.equal(texts(md)[2], 'Para one\nstill one');
});

test('fences keep blank lines and markdown inside', () => {
  const md = 'a\n\n```js\nconst x = 1;\n\n# not a heading\n```\n\nb';
  assert.deepEqual(kinds(md), ['paragraph', 'code', 'paragraph']);
  assert.ok(texts(md)[1].includes('# not a heading'));
});

test('unclosed fence goes to end of note', () => {
  assert.deepEqual(kinds('x\n\n```\ncode\nmore'), ['paragraph', 'code']);
});

test('math and comments', () => {
  const md = '$$\na^2\n\nb\n$$\n\n$$x$$\n\n%%\nhidden\n%%\n\ntext';
  // A blank line inside $$ must not split it.
  assert.deepEqual(kinds(md), ['math', 'math', 'comment', 'paragraph']);
});

test('list items are separate blocks with nested content', () => {
  const md = '- one\n  - nested\n- two\n\n  continued two\n- three\n\nafter';
  const b = splitBlocks(md);
  assert.deepEqual(b.map((x) => x.kind), ['list', 'list', 'list', 'paragraph']);
  assert.equal(b[0].text, '- one\n  - nested');
  assert.equal(b[1].text, '- two\n\n  continued two');
});

test('callouts and quotes, tables, rules', () => {
  const md = '> [!note] Title\n> body\n> [!warning]\n> other\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n***\n\n- - -';
  assert.deepEqual(kinds(md), ['quote', 'quote', 'table', 'rule', 'rule']);
});

test('heading interrupts paragraph, list interrupts paragraph', () => {
  assert.deepEqual(kinds('para\n# H\npara2\n- item'), ['paragraph', 'heading', 'paragraph', 'list']);
});

test('CRLF input', () => {
  assert.deepEqual(kinds('# H\r\n\r\ntext\r\n'), ['heading', 'paragraph']);
});

test('align: equal, modified, inserted, deleted', () => {
  const oldMd = '# Title\n\nThe quick brown fox jumps.\n\nRemoved paragraph here.\n\nSame end.';
  const newMd = '# Title\n\nThe quick red fox jumps.\n\nSame end.\n\nBrand new closing line.';
  const rows = alignBlocks(splitBlocks(oldMd), splitBlocks(newMd));
  assert.deepEqual(rows.map((r) => r.type), ['equal', 'modified', 'deleted', 'equal', 'inserted']);
  assert.deepEqual(changeGroups(rows), [
    { start: 1, end: 2 },
    { start: 4, end: 4 },
  ]);
});

test('align: unrelated blocks are replaced, not modified', () => {
  const rows = alignBlocks(splitBlocks('Alpha beta gamma.'), splitBlocks('Totally different text!'));
  assert.deepEqual(rows.map((r) => r.type), ['replaced']);
});

test('align: pairs the right block when several change', () => {
  const oldMd = 'First paragraph about cats.\n\nSecond paragraph about dogs.';
  const newMd = 'Inserted intro.\n\nFirst paragraph about big cats.\n\nSecond paragraph about small dogs.';
  const rows = alignBlocks(splitBlocks(oldMd), splitBlocks(newMd));
  assert.deepEqual(rows.map((r) => r.type), ['inserted', 'modified', 'modified']);
  assert.equal(rows[1].old!.text, 'First paragraph about cats.');
});

test('align: new file and deleted file', () => {
  assert.deepEqual(alignBlocks([], splitBlocks('a\n\nb')).map((r) => r.type), ['inserted', 'inserted']);
  assert.deepEqual(alignBlocks(splitBlocks('a'), []).map((r) => r.type), ['deleted']);
  assert.deepEqual(alignBlocks([], []), []);
});

test('align: trailing whitespace is not a change', () => {
  const rows = alignBlocks(splitBlocks('text  \nline'), splitBlocks('text\nline'));
  assert.deepEqual(rows.map((r) => r.type), ['equal']);
});

test('wordDiff works on words, not characters', () => {
  const d = wordDiff('the cat sat', 'the bat sat');
  assert.deepEqual(d, [
    [0, 'the '],
    [-1, 'cat'],
    [1, 'bat'],
    [0, ' sat'],
  ]);
  // Accented words are single tokens.
  assert.deepEqual(wordDiff('canción vieja', 'canción nueva').filter(([op]) => op !== 0), [
    [-1, 'vieja'],
    [1, 'nueva'],
  ]);
});

test('highlightPair wraps changed words across inline elements', () => {
  const dom = new JSDOM('<div id="a"><p>The <strong>quick</strong> brown <a>fox</a> jumps.</p></div><div id="b"><p>The <strong>slow</strong> brown <a>fox</a> leaps high.</p></div>');
  const doc = dom.window.document;
  const a = doc.getElementById('a') as unknown as HTMLElement;
  const b = doc.getElementById('b') as unknown as HTMLElement;
  highlightPair(a, b);
  const del = [...a.querySelectorAll('.rmd-word-del')].map((e) => e.textContent);
  const ins = [...b.querySelectorAll('.rmd-word-ins')].map((e) => e.textContent);
  assert.deepEqual(del, ['quick', 'jumps']);
  assert.deepEqual(ins, ['slow', 'leaps high']);
  // Structure is preserved.
  assert.equal(a.querySelector('strong')!.textContent, 'quick');
  assert.equal(b.querySelector('a')!.textContent, 'fox');
  assert.equal(a.textContent, 'The quick brown fox jumps.');
});

test('highlightPair: one text node with several ranges', () => {
  const dom = new JSDOM('<p id="a">one two three four</p><p id="b">one 2 three 4</p>');
  const doc = dom.window.document;
  const a = doc.getElementById('a') as unknown as HTMLElement;
  const b = doc.getElementById('b') as unknown as HTMLElement;
  highlightPair(a, b);
  assert.equal(a.innerHTML, 'one <span class="rmd-word-del">two</span> three <span class="rmd-word-del">four</span>');
  assert.equal(b.innerHTML, 'one <span class="rmd-word-ins">2</span> three <span class="rmd-word-ins">4</span>');
});
