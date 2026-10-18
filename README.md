# Rendered Markdown Diff for Obsidian

[Español](README.es.md)

Compare a note with its git history, with both versions **rendered** and shown side by side. You see what changed in the note as you read it, not as raw `+` / `−` lines.

![Rendered side-by-side diff of a note against HEAD](docs/overview-light.png)

The previous version is on the left and the current note on the right. Both are rendered with Obsidian's own renderer, so wiki-links, callouts, embeds, tables, code, Mermaid and Dataview look the way they do in Reading view. The two sides are aligned block by block and share one scroll, so they never drift apart.

## Features

- **Compare against any version**: HEAD (the last commit), the staged changes (the index) or any commit that touched the note. The right side can be the current note or the staged version.
- **See exactly what changed**:
  - Added blocks are green.
  - Removed blocks are red.
  - Edited blocks have a yellow edge, with the words that changed highlighted inside them. This also works inside tables, lists, callouts and the frontmatter.
- **Change map**: a strip on the right shows where every change is and which part of the note is on screen. Click or drag it to move.
- **Jump from change to change**:
  - The ↑ ↓ buttons in the toolbar.
  - `n` / `p` or `Alt+↓` / `Alt+↑` while the diff has focus.
  - The *Go to next change* and *Go to previous change* commands, which you can bind to any hotkey.
- **Show only changes**: fold long runs of unchanged blocks and keep a few blocks of context around each change.
- **Live**: the diff refreshes as you edit the note.
- **Follow links**: wiki-links in either side open the linked note, and hovering them shows the usual page preview.

![Word-level highlights in paragraphs and tables](docs/words.png)

![Navigating changes in a dark theme](docs/navigate-dark.png)

## Usage

With a note open, do one of these:

- Click the **git-compare** icon in the left ribbon.
- Run **Show rendered diff of current note** from the command palette.
- Right-click the note, or open the tab's `⋯` menu, and choose **Show rendered diff**.

Then pick the version to compare against in the left dropdown.

The plugin needs the note to be inside a git repository: the vault itself, or any folder above it.

## Installation

### With BRAT

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin.
2. Run **BRAT: Add a beta plugin for testing**.
3. Paste `edangelo2/obsidian-rendered-markdown-diff`.
4. Enable **Rendered Markdown Diff** in **Settings → Community plugins**.

BRAT also keeps the plugin up to date.

### Manually

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/edangelo2/obsidian-rendered-markdown-diff/releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/rendered-markdown-diff/`.
3. Reload the plugin list in **Settings → Community plugins** and enable **Rendered Markdown Diff**.

## Settings

| Setting | What it does |
|---|---|
| Compare against | The default left side: HEAD or staged. |
| Open the diff in | A new tab or a split to the right. |
| Highlight changed words | Mark the exact words that changed inside edited blocks. |
| Show only changes by default | Open the diff with unchanged blocks folded. |
| Context blocks | How many unchanged blocks stay visible around each change when folding. |
| Commits in the list | How many commits the version picker shows. |
| Git executable | Path to `git`. Leave it empty to find it on PATH, in Homebrew or in `/usr/bin`. Obsidian started from the Dock doesn't always see your shell's PATH. |

## Safety

The plugin only reads from git. It runs `git rev-parse`, `git show` and `git log` with `execFile` (no shell), and it never stages, commits, checks out or writes anything in your repository. The plugin itself makes no network requests (images in your notes load as they do in Reading view).

It is desktop only, because it needs to run `git`.

## How it works

1. **Split into blocks.** Each version is split into top-level blocks: frontmatter, headings, paragraphs, each list item, callouts, tables, code, `$$` math and `%%` comments.
2. **Align the blocks.** A sequence diff aligns the blocks of the two versions. Inside each changed region, blocks that are similar enough (at least 40% in common) are paired as *edited*. The rest are shown as added, removed or replaced.
3. **Render.** Each block is rendered with Obsidian's `MarkdownRenderer`. Every row is a two-column grid, so both sides share its height and the whole diff scrolls as one.
4. **Highlight words.** For edited blocks, the plugin compares the rendered text word by word and wraps only the changed words. This works on whatever the renderer produced (links, callouts, tables) without parsing Markdown again.

**Limitations:**

- Blocks are rendered one by one, so anything that depends on the whole note (such as footnote numbering) can look slightly different from Reading view.
- Embeds in an old version show the current content of the embedded note.

## Development

```bash
npm ci
npm test         # block splitting, alignment, word diff, and git against real repos
npm run dev      # rebuild main.js on every change
npm run build    # type-check and build main.js
```

To try your build, link or copy the folder into `<vault>/.obsidian/plugins/rendered-markdown-diff/`.

To release a new version:

1. Bump `version` in `manifest.json` and `package.json`, and add the version to `versions.json`.
2. Publish it in one of two ways:
   - In the **Actions** tab, open **Release** and click **Run workflow**.
   - Push a tag with the same number, for example `git tag 0.2.0 && git push --tags`.

The release workflow tests and builds the plugin, then attaches `main.js`, `manifest.json` and `styles.css` to the GitHub release.

## Credits

The idea comes from the VS Code extension [Markdown Diff Visualiser](https://github.com/arjuntic/markdown-diff-visualiser). This plugin is written from scratch for Obsidian.

## License

[MIT](LICENSE)
