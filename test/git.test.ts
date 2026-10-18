import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Git, GitError } from '../src/git';

function repo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmd-git-'));
  const g = (...args: string[]) => execFileSync('git', args, { cwd: dir });
  g('init', '-q');
  g('config', 'user.email', 't@t');
  g('config', 'user.name', 'T');
  return dir;
}

test('show HEAD, index and commits for a file in a subfolder with spaces and accents', async () => {
  const dir = repo();
  const sub = path.join(dir, 'Área de pruebas');
  fs.mkdirSync(sub);
  const file = path.join(sub, 'Nota con espacios.md');
  const g = (...args: string[]) => execFileSync('git', args, { cwd: dir });
  fs.writeFileSync(file, 'v1\n');
  g('add', '.');
  g('commit', '-qm', 'first');
  fs.writeFileSync(file, 'v2\n');
  g('add', '.');
  g('commit', '-qm', 'second: ñandú');
  fs.writeFileSync(file, 'v3 staged\n');
  g('add', '.');
  fs.writeFileSync(file, 'v4 working\n');

  const git = new Git(() => '');
  await git.ensureRepo(file);
  assert.equal(await git.show('HEAD', file), 'v2\n');
  assert.equal(await git.show('', file), 'v3 staged\n');
  const log = await git.log(file, 10);
  assert.deepEqual(log.map((c) => c.subject), ['second: ñandú', 'first']);
  assert.equal(await git.show(log[1].hash, file), 'v1\n');
});

test('untracked file and empty repository return null', async () => {
  const dir = repo();
  const file = path.join(dir, 'new.md');
  fs.writeFileSync(file, 'x');
  const git = new Git(() => '');
  assert.equal(await git.show('HEAD', file), null);
  assert.equal(await git.show('', file), null);
  assert.deepEqual(await git.log(file, 10), []);
});

test('file not in an older commit returns null', async () => {
  const dir = repo();
  const g = (...args: string[]) => execFileSync('git', args, { cwd: dir });
  fs.writeFileSync(path.join(dir, 'a.md'), 'a');
  g('add', '.');
  g('commit', '-qm', 'a');
  const first = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
  const file = path.join(dir, 'b.md');
  fs.writeFileSync(file, 'b');
  g('add', '.');
  g('commit', '-qm', 'b');
  const git = new Git(() => '');
  assert.equal(await git.show(first, file), null);
  assert.equal(await git.show('HEAD', file), 'b');
});

test('outside a repository', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmd-norepo-'));
  const git = new Git(() => '');
  await assert.rejects(git.ensureRepo(path.join(dir, 'x.md')), (e: unknown) => e instanceof GitError && e.code === 'NOT_A_REPO');
});

test('bad configured git path', async () => {
  const git = new Git(() => '/nope/git');
  await assert.rejects(git.ensureRepo('/tmp/x.md'), (e: unknown) => e instanceof GitError && e.code === 'NOT_FOUND');
});
