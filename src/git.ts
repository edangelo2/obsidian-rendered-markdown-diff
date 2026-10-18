/**
 * Read-only access to git. Every command runs with execFile (no shell) and
 * only reads: `rev-parse`, `show` and `log`. Nothing is staged, committed or
 * written to the repository.
 */

import { execFile } from 'child_process';
import * as path from 'path';

export interface CommitInfo {
  hash: string;
  short: string;
  date: string;
  author: string;
  subject: string;
}

export class GitError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'NOT_A_REPO' | 'FAILED',
  ) {
    super(message);
  }
}

/** Where to look for git when Obsidian is started from the Dock and PATH is minimal. */
const FALLBACK_PATHS = ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git', 'C:\\Program Files\\Git\\cmd\\git.exe'];

export class Git {
  private resolved: string | null = null;

  constructor(private readonly configuredPath: () => string) {}

  /** Forget the resolved binary (after the setting changes). */
  reset(): void {
    this.resolved = null;
  }

  private exec(bin: string, args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        bin,
        args,
        { cwd, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            const err = error as NodeJS.ErrnoException & { stderr?: string };
            err.stderr = String(stderr ?? '');
            reject(err);
          } else {
            resolve(String(stdout));
          }
        },
      );
    });
  }

  private async run(args: string[], cwd: string): Promise<string> {
    if (this.resolved) return this.exec(this.resolved, args, cwd);
    const configured = this.configuredPath().trim();
    const candidates = configured ? [configured] : ['git', ...FALLBACK_PATHS];
    for (const bin of candidates) {
      try {
        const out = await this.exec(bin, args, cwd);
        this.resolved = bin;
        return out;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue;
        this.resolved = bin;
        throw e;
      }
    }
    throw new GitError('git not found', 'NOT_FOUND');
  }

  /** Checks that the file's folder is inside a git work tree. */
  async ensureRepo(absFile: string): Promise<void> {
    try {
      const out = await this.run(['rev-parse', '--is-inside-work-tree'], path.dirname(absFile));
      if (out.trim() !== 'true') throw new GitError('not a git repository', 'NOT_A_REPO');
    } catch (e) {
      if (e instanceof GitError) throw e;
      throw new GitError('not a git repository', 'NOT_A_REPO');
    }
  }

  /**
   * Content of the file at a revision (`HEAD`, a commit hash) or in the index
   * (`rev` = ''). Returns null when the file does not exist there.
   */
  async show(rev: string, absFile: string): Promise<string | null> {
    const spec = `${rev}:./${path.basename(absFile)}`;
    try {
      return await this.run(['show', spec], path.dirname(absFile));
    } catch (e) {
      if (e instanceof GitError) throw e;
      const stderr = (e as { stderr?: string }).stderr ?? '';
      if (/exists on disk, but not in|does not exist in|not in the index|invalid object name|unknown revision|bad revision|path '.*' does not exist/i.test(stderr)) {
        return null;
      }
      throw new GitError(stderr.trim() || String(e), 'FAILED');
    }
  }

  /** Commits that changed the file, newest first. */
  async log(absFile: string, limit: number): Promise<CommitInfo[]> {
    try {
      const out = await this.run(
        ['log', `-n${limit}`, '--format=%H%x1f%h%x1f%as%x1f%an%x1f%s', '--', `./${path.basename(absFile)}`],
        path.dirname(absFile),
      );
      return out
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, short, date, author, subject] = line.split('\x1f');
          return { hash, short, date, author, subject };
        });
    } catch (e) {
      if (e instanceof GitError) throw e;
      // A repository without commits has no log.
      return [];
    }
  }
}
