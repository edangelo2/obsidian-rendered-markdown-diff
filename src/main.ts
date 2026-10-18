import { FileSystemAdapter, MarkdownView, Menu, Notice, Platform, Plugin, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import * as path from 'path';
import { Git } from './git';
import { t } from './i18n';
import { DEFAULT_SETTINGS, RenderedDiffSettings, RenderedDiffSettingTab } from './settings';
import { DiffView, VIEW_TYPE } from './view';

export default class RenderedDiffPlugin extends Plugin {
  settings!: RenderedDiffSettings;
  git!: Git;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.git = new Git(() => this.settings.gitPath);

    if (!Platform.isDesktopApp) return;

    this.registerView(VIEW_TYPE, (leaf) => new DiffView(leaf, this));
    this.addSettingTab(new RenderedDiffSettingTab(this.app, this));

    this.addRibbonIcon('git-compare', t.openDiff, () => {
      const file = this.app.workspace.getActiveFile();
      if (file && file.extension === 'md') void this.openDiff(file);
      else new Notice(t.noFile);
    });

    this.addCommand({
      id: 'open',
      name: t.openDiff,
      checkCallback: (checking) => {
        const file = this.activeNote();
        if (!file) return false;
        if (!checking) void this.openDiff(file);
        return true;
      },
    });

    this.addCommand({
      id: 'next-change',
      name: t.nextChange,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(DiffView);
        if (!view) return false;
        if (!checking) view.next();
        return true;
      },
    });

    this.addCommand({
      id: 'previous-change',
      name: t.prevChange,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(DiffView);
        if (!view) return false;
        if (!checking) view.prev();
        return true;
      },
    });

    this.addCommand({
      id: 'refresh',
      name: t.refresh,
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(DiffView);
        if (!view) return false;
        if (!checking) void view.refresh(true);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        menu.addItem((item) =>
          item
            .setTitle(t.openDiffMenu)
            .setIcon('git-compare')
            .onClick(() => void this.openDiff(file)),
        );
      }),
    );

    // Keep open diffs in step with the note.
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        for (const view of this.diffViews()) {
          if (view.file === file && view.right === 'WORKING') view.scheduleRefresh();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('rename', (file) => {
        for (const view of this.diffViews()) {
          if (view.file === file) {
            view.setFile(file as TFile);
            view.scheduleRefresh();
          }
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        for (const view of this.diffViews()) if (view.file === file) view.scheduleRefresh();
      }),
    );
  }

  onunload(): void {
    // Views are detached by Obsidian when the plugin unloads.
  }

  private activeNote(): TFile | null {
    const md = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = md?.file ?? this.app.workspace.getActiveFile();
    return file && file.extension === 'md' ? file : null;
  }

  private diffViews(): DiffView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE)
      .map((l) => l.view)
      .filter((v): v is DiffView => v instanceof DiffView);
  }

  absolutePath(file: TFile): string {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) throw new Error('Desktop only');
    return path.join(adapter.getBasePath(), file.path);
  }

  async openDiff(file: TFile): Promise<void> {
    const { workspace } = this.app;
    // Reuse a diff already open for this note.
    // (Background tabs may still be deferred, so match on the saved state.)
    let leaf: WorkspaceLeaf | undefined = workspace
      .getLeavesOfType(VIEW_TYPE)
      .find((l) => (l.getViewState().state as { file?: string } | undefined)?.file === file.path);
    if (leaf) {
      await workspace.revealLeaf(leaf);
      if (leaf.view instanceof DiffView) await leaf.view.refresh(true);
      return;
    }
    leaf = this.settings.openIn === 'split' ? workspace.getLeaf('split', 'vertical') : workspace.getLeaf('tab');
    await leaf.setViewState({
      type: VIEW_TYPE,
      active: true,
      state: { file: file.path, left: this.settings.defaultLeft, right: 'WORKING', collapse: this.settings.collapse },
    });
    await workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
