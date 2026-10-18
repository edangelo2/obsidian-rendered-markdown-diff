import { Component, ItemView, Keymap, MarkdownRenderer, Scope, TFile, ViewStateResult, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import { Block, splitBlocks } from './blocks';
import { alignBlocks, changeGroups, ChangeGroup, Row } from './align';
import { highlightPair } from './highlight';
import { CommitInfo, GitError } from './git';
import { t } from './i18n';
import type RenderedDiffPlugin from './main';

export const VIEW_TYPE = 'rendered-md-diff';

/** Left side: 'HEAD', 'INDEX' or 'commit:<hash>'. */
export type LeftSpec = string;
export type RightSpec = 'WORKING' | 'INDEX';

export interface DiffViewState extends Record<string, unknown> {
  file?: string;
  left?: LeftSpec;
  right?: RightSpec;
  collapse?: boolean;
}

export class DiffView extends ItemView {
  file: TFile | null = null;
  left: LeftSpec = 'HEAD';
  right: RightSpec = 'WORKING';
  collapse = false;

  private commits: CommitInfo[] = [];
  private rows: Row[] = [];
  private groups: ChangeGroup[] = [];
  private rowEls: HTMLElement[] = [];
  private current = -1;
  /** Last change jumped to, and when: repeated presses step from it. */
  private nav = { index: -1, top: 0, at: 0 };
  private renderToken = 0;
  private renderComp: Component | null = null;
  private refreshTimer: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // DOM
  private leftSelect!: HTMLSelectElement;
  private rightSelect!: HTMLSelectElement;
  private statsEl!: HTMLElement;
  private counterEl!: HTMLElement;
  private collapseBtn!: HTMLElement;
  private bodyEl!: HTMLElement;
  private scrollEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private headOld!: HTMLElement;
  private headNew!: HTMLElement;
  private rowsEl!: HTMLElement;
  private minimapEl!: HTMLElement;
  private viewportEl!: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: RenderedDiffPlugin,
  ) {
    super(leaf);
    this.collapse = plugin.settings.collapse;
    this.left = plugin.settings.defaultLeft;
    this.scope = new Scope(this.app.scope);
    this.scope.register(['Alt'], 'ArrowDown', () => (this.next(), false));
    this.scope.register(['Alt'], 'ArrowUp', () => (this.prev(), false));
    this.scope.register([], 'n', () => (this.next(), false));
    this.scope.register([], 'p', () => (this.prev(), false));
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file ? `${t.viewTitle}: ${this.file.basename}` : t.viewTitle;
  }

  getIcon(): string {
    return 'git-compare';
  }

  getState(): Record<string, unknown> {
    return { file: this.file?.path, left: this.left, right: this.right, collapse: this.collapse };
  }

  async setState(state: DiffViewState, result: ViewStateResult): Promise<void> {
    if (state.file) {
      const f = this.app.vault.getAbstractFileByPath(state.file);
      this.file = f instanceof TFile ? f : null;
    }
    if (state.left) this.left = state.left;
    if (state.right) this.right = state.right;
    if (typeof state.collapse === 'boolean') this.collapse = state.collapse;
    await super.setState(state, result);
    (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
    await this.refresh(false);
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass('rmd-view');

    // Toolbar
    const bar = root.createDiv('rmd-toolbar');
    const pick = bar.createDiv('rmd-pick');
    this.leftSelect = pick.createEl('select', { cls: 'dropdown rmd-select' });
    pick.createSpan({ cls: 'rmd-arrow', text: '↔' });
    this.rightSelect = pick.createEl('select', { cls: 'dropdown rmd-select' });
    this.rightSelect.createEl('option', { value: 'WORKING', text: t.working });
    this.rightSelect.createEl('option', { value: 'INDEX', text: t.index });

    const nav = bar.createDiv('rmd-nav');
    this.statsEl = nav.createDiv('rmd-stats');
    setTooltip(this.statsEl, t.statsTitle);
    const prevBtn = nav.createDiv({ cls: 'clickable-icon rmd-btn', attr: { 'aria-label': t.prevChange } });
    setIcon(prevBtn, 'arrow-up');
    this.counterEl = nav.createDiv('rmd-counter');
    const nextBtn = nav.createDiv({ cls: 'clickable-icon rmd-btn', attr: { 'aria-label': t.nextChange } });
    setIcon(nextBtn, 'arrow-down');
    this.collapseBtn = nav.createDiv({ cls: 'clickable-icon rmd-btn', attr: { 'aria-label': t.toggleCollapse } });
    setIcon(this.collapseBtn, 'fold-vertical');
    const refreshBtn = nav.createDiv({ cls: 'clickable-icon rmd-btn', attr: { 'aria-label': t.refresh } });
    setIcon(refreshBtn, 'refresh-cw');

    // Body: scroller (header + rows) and minimap
    this.bodyEl = root.createDiv('rmd-body');
    this.scrollEl = this.bodyEl.createDiv('rmd-scroll');
    const head = this.scrollEl.createDiv('rmd-head');
    this.headOld = head.createDiv('rmd-colhead');
    this.headNew = head.createDiv('rmd-colhead');
    this.bannerEl = this.scrollEl.createDiv('rmd-banner');
    this.rowsEl = this.scrollEl.createDiv('rmd-rows');
    this.minimapEl = this.bodyEl.createDiv('rmd-minimap');
    this.viewportEl = this.minimapEl.createDiv('rmd-minimap-viewport');

    this.registerDomEvent(this.leftSelect, 'change', () => {
      this.left = this.leftSelect.value;
      void this.refresh(false);
      this.app.workspace.requestSaveLayout();
    });
    this.registerDomEvent(this.rightSelect, 'change', () => {
      this.right = this.rightSelect.value as RightSpec;
      void this.refresh(false);
      this.app.workspace.requestSaveLayout();
    });
    this.registerDomEvent(prevBtn, 'click', () => this.prev());
    this.registerDomEvent(nextBtn, 'click', () => this.next());
    this.registerDomEvent(refreshBtn, 'click', () => void this.refresh(true));
    this.registerDomEvent(this.collapseBtn, 'click', () => {
      this.collapse = !this.collapse;
      this.applyCollapse();
      this.app.workspace.requestSaveLayout();
    });
    this.registerDomEvent(this.scrollEl, 'scroll', () => this.onScroll(), { passive: true });
    this.registerMinimapEvents();
    this.registerLinkEvents();

    // Images and late renders change heights: keep the minimap in step.
    const ro = new ResizeObserver(() => this.layoutMinimap());
    ro.observe(this.scrollEl);
    ro.observe(this.rowsEl);
    this.resizeObserver = ro;
    this.register(() => ro.disconnect());
    this.registerDomEvent(this.scrollEl, 'load', () => this.layoutMinimap(), { capture: true });

    this.updateToolbar();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.renderComp?.unload();
  }

  /** Re-render soon (used when the note changes on disk). */
  scheduleRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh(true);
    }, 400);
  }

  setFile(file: TFile | null): void {
    this.file = file;
    (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
  }

  // ---------------------------------------------------------------- loading

  private sideLabel(spec: string): string {
    if (spec === 'HEAD') {
      const head = this.commits[0];
      return head ? `HEAD · ${head.short} · ${head.date}` : 'HEAD';
    }
    if (spec === 'INDEX') return t.index;
    if (spec === 'WORKING') return t.working;
    const hash = spec.slice('commit:'.length);
    const c = this.commits.find((x) => x.hash === hash);
    return c ? `${c.short} · ${c.date}` : hash.slice(0, 7);
  }

  private async readSide(spec: string, abs: string): Promise<string | null> {
    const git = this.plugin.git;
    if (spec === 'WORKING') {
      const f = this.file;
      if (!f || !this.app.vault.getAbstractFileByPath(f.path)) return null;
      return this.app.vault.read(f);
    }
    if (spec === 'INDEX') return git.show('', abs);
    if (spec === 'HEAD') return git.show('HEAD', abs);
    return git.show(spec.slice('commit:'.length), abs);
  }

  private showMessage(text: string): void {
    this.rows = [];
    this.groups = [];
    this.rowEls = [];
    this.rowsEl.empty();
    this.bannerEl.empty();
    this.rowsEl.createDiv({ cls: 'rmd-message', text });
    this.headOld.setText('');
    this.headNew.setText('');
    this.updateStats();
    this.layoutMinimap();
  }

  async refresh(keepScroll: boolean): Promise<void> {
    if (!this.rowsEl) return;
    const token = ++this.renderToken;
    const file = this.file;
    if (!file) return this.showMessage(t.noFile);
    if (file.extension !== 'md') return this.showMessage(t.notMarkdown);

    const abs = this.plugin.absolutePath(file);
    const git = this.plugin.git;
    let oldText: string | null;
    let newText: string | null;
    try {
      await git.ensureRepo(abs);
      this.commits = await git.log(abs, this.plugin.settings.commits);
      if (token !== this.renderToken) return;
      this.updateToolbar();
      [oldText, newText] = await Promise.all([this.readSide(this.left, abs), this.readSide(this.right, abs)]);
    } catch (e) {
      if (token !== this.renderToken) return;
      if (e instanceof GitError && e.code === 'NOT_A_REPO') return this.showMessage(t.notRepo);
      if (e instanceof GitError && e.code === 'NOT_FOUND') return this.showMessage(t.gitNotFound);
      return this.showMessage(t.gitFailed + (e instanceof Error ? e.message : String(e)));
    }
    if (token !== this.renderToken) return;

    const rows = alignBlocks(splitBlocks(oldText ?? ''), splitBlocks(newText ?? ''));
    const comp = new Component();
    this.addChild(comp);

    const rowsEl = createDiv('rmd-rows');
    const rowEls: HTMLElement[] = [];
    const jobs: Promise<void>[] = [];
    rows.forEach((row, i) => {
      const el = rowsEl.createDiv({ cls: `rmd-row rmd-${row.type}`, attr: { 'data-row': String(i) } });
      const oldCell = el.createDiv('rmd-cell rmd-old markdown-rendered');
      const newCell = el.createDiv('rmd-cell rmd-new markdown-rendered');
      if (row.old) jobs.push(this.renderBlock(row.old, oldCell, comp));
      else oldCell.addClass('rmd-empty');
      if (row.new) jobs.push(this.renderBlock(row.new, newCell, comp));
      else newCell.addClass('rmd-empty');
      rowEls.push(el);
    });
    await Promise.all(jobs);
    if (token !== this.renderToken) {
      this.removeChild(comp);
      return;
    }

    if (this.plugin.settings.wordDiff) {
      rows.forEach((row, i) => {
        if (row.type !== 'modified') return;
        const [oldCell, newCell] = Array.from(rowEls[i].children) as HTMLElement[];
        try {
          highlightPair(oldCell, newCell);
        } catch (err) {
          console.warn('[rendered-diff] word highlight failed', err);
        }
      });
    }

    // Swap the new rows in, keeping the scroll position on refresh.
    const top = keepScroll ? this.scrollEl.scrollTop : 0;
    this.resizeObserver?.unobserve(this.rowsEl);
    this.rowsEl.replaceWith(rowsEl);
    this.rowsEl = rowsEl;
    this.resizeObserver?.observe(rowsEl);
    if (this.renderComp) this.removeChild(this.renderComp);
    this.renderComp = comp;
    this.rows = rows;
    this.rowEls = rowEls;
    this.groups = changeGroups(rows);
    this.current = -1;
    this.nav = { index: -1, top: 0, at: 0 };

    // Headers and banner
    this.headOld.empty();
    this.headOld.createSpan({ cls: 'rmd-colhead-sign rmd-sign-del', text: '−' });
    this.headOld.createSpan({ cls: 'rmd-colhead-ver', text: this.sideLabel(this.left) });
    if (oldText === null) this.headOld.createSpan({ cls: 'rmd-colhead-note', text: t.notInLeft });
    this.headNew.empty();
    this.headNew.createSpan({ cls: 'rmd-colhead-sign rmd-sign-ins', text: '+' });
    this.headNew.createSpan({ cls: 'rmd-colhead-ver', text: this.sideLabel(this.right) });
    if (newText === null) this.headNew.createSpan({ cls: 'rmd-colhead-note', text: t.notInRight });

    this.bannerEl.empty();
    if (this.left === this.right) this.bannerEl.createDiv({ cls: 'rmd-banner-msg', text: t.sameSides });
    else if (!this.groups.length) this.bannerEl.createDiv({ cls: 'rmd-banner-msg', text: t.noChanges });

    this.applyCollapse();
    this.updateStats();
    window.requestAnimationFrame(() => {
      this.scrollEl.scrollTop = top;
      this.layoutMinimap();
      this.onScroll();
    });
  }

  private async renderBlock(block: Block, el: HTMLElement, comp: Component): Promise<void> {
    let md = block.text;
    if (block.kind === 'frontmatter') {
      // Show properties as YAML instead of letting "---" render as rules.
      md = '```yaml\n' + block.text.split('\n').slice(1, -1).join('\n') + '\n```';
      el.addClass('rmd-frontmatter');
    } else if (block.kind === 'comment') {
      // %% comments %% render as nothing; show them muted so the change is visible.
      md = '```\n' + block.text + '\n```';
      el.addClass('rmd-comment');
    }
    try {
      await MarkdownRenderer.render(this.app, md, el, this.file?.path ?? '', comp);
    } catch (err) {
      el.createEl('pre', { text: block.text });
      console.warn('[rendered-diff] render failed', err);
    }
  }

  // ---------------------------------------------------------------- toolbar

  private updateToolbar(): void {
    if (!this.leftSelect) return;
    const sel = this.leftSelect;
    sel.empty();
    sel.createEl('option', { value: 'HEAD', text: t.head });
    sel.createEl('option', { value: 'INDEX', text: t.index });
    const hasCommit = this.left.startsWith('commit:');
    if (this.commits.length || hasCommit) {
      const group = sel.createEl('optgroup', { attr: { label: t.commits } });
      for (const c of this.commits) {
        const subject = c.subject.length > 60 ? c.subject.slice(0, 57) + '…' : c.subject;
        group.createEl('option', { value: `commit:${c.hash}`, text: `${c.short} · ${c.date} · ${subject}` });
      }
      if (hasCommit && !this.commits.some((c) => `commit:${c.hash}` === this.left)) {
        group.createEl('option', { value: this.left, text: this.left.slice(7, 14) });
      }
    }
    sel.value = this.left;
    this.rightSelect.value = this.right;
    this.collapseBtn.toggleClass('is-active', this.collapse);
  }

  private updateStats(): void {
    let ins = 0;
    let del = 0;
    let mod = 0;
    for (const r of this.rows) {
      if (r.type === 'inserted') ins++;
      else if (r.type === 'deleted') del++;
      else if (r.type !== 'equal') mod++;
    }
    this.statsEl.empty();
    this.statsEl.createSpan({ cls: 'rmd-stat-ins', text: `+${ins}` });
    this.statsEl.createSpan({ cls: 'rmd-stat-del', text: `−${del}` });
    this.statsEl.createSpan({ cls: 'rmd-stat-mod', text: `~${mod}` });
    this.updateCounter();
  }

  private updateCounter(): void {
    this.counterEl.setText(t.changeCounter(this.current + 1, this.groups.length));
  }

  // ---------------------------------------------------------------- folding

  private applyCollapse(): void {
    this.collapseBtn?.toggleClass('is-active', this.collapse);
    this.rowsEl.querySelectorAll('.rmd-fold').forEach((el) => el.remove());
    this.rowEls.forEach((el) => el.removeClass('rmd-hidden'));
    if (this.collapse && this.groups.length) {
      const ctx = this.plugin.settings.context;
      const visible = new Array<boolean>(this.rows.length).fill(false);
      for (const g of this.groups) {
        for (let i = Math.max(0, g.start - ctx); i <= Math.min(this.rows.length - 1, g.end + ctx); i++) visible[i] = true;
      }
      let i = 0;
      while (i < this.rows.length) {
        if (visible[i]) {
          i++;
          continue;
        }
        const start = i;
        while (i < this.rows.length && !visible[i]) i++;
        const run = this.rowEls.slice(start, i);
        if (run.length < 2) continue;
        run.forEach((el) => el.addClass('rmd-hidden'));
        const fold = createDiv({ cls: 'rmd-fold', text: `⋯ ${t.unchangedBlocks(run.length)}` });
        fold.addEventListener('click', () => {
          run.forEach((el) => el.removeClass('rmd-hidden'));
          fold.remove();
          this.layoutMinimap();
        });
        run[0].before(fold);
      }
    }
    window.requestAnimationFrame(() => this.layoutMinimap());
  }

  // ---------------------------------------------------------------- navigation

  private headerOffset(): number {
    const head = this.scrollEl.querySelector('.rmd-head') as HTMLElement | null;
    return (head?.offsetHeight ?? 0) + 8;
  }

  private groupTop(g: ChangeGroup): number {
    return this.rowEls[g.start].offsetTop;
  }

  goTo(index: number): void {
    if (!this.groups.length) return;
    const n = this.groups.length;
    this.current = ((index % n) + n) % n;
    const g = this.groups[this.current];
    this.rowEls.forEach((el) => el.removeClass('rmd-focus'));
    for (let i = g.start; i <= g.end; i++) {
      const el = this.rowEls[i];
      el.removeClass('rmd-hidden');
      el.addClass('rmd-focus');
    }
    const top = Math.max(0, this.groupTop(g) - this.headerOffset());
    this.nav = { index: this.current, top, at: Date.now() };
    this.scrollEl.scrollTo({ top, behavior: 'smooth' });
    this.updateCounter();
  }

  /** True while the view is still at (or scrolling to) the last jump. */
  private atLastJump(): boolean {
    if (this.nav.index < 0) return false;
    return Date.now() - this.nav.at < 900 || Math.abs(this.scrollEl.scrollTop - this.nav.top) < 4;
  }

  next(): void {
    if (!this.groups.length) return;
    if (this.atLastJump()) return this.goTo(this.nav.index + 1);
    const viewTop = this.scrollEl.scrollTop + this.headerOffset() + 2;
    const idx = this.groups.findIndex((g) => this.groupTop(g) > viewTop);
    this.goTo(idx === -1 ? 0 : idx);
  }

  prev(): void {
    if (!this.groups.length) return;
    if (this.atLastJump()) return this.goTo(this.nav.index - 1);
    const viewTop = this.scrollEl.scrollTop + this.headerOffset() - 2;
    let idx = -1;
    this.groups.forEach((g, i) => {
      if (this.groupTop(g) < viewTop) idx = i;
    });
    this.goTo(idx === -1 ? this.groups.length - 1 : idx);
  }

  private onScroll(): void {
    this.layoutViewport();
    if (!this.groups.length) return;
    // The counter follows the first change visible at the top of the view.
    const viewTop = this.scrollEl.scrollTop + this.headerOffset();
    let idx = this.groups.findIndex((g) => {
      const last = this.rowEls[g.end];
      return last.offsetTop + last.offsetHeight > viewTop;
    });
    if (idx === -1) idx = this.groups.length - 1;
    if (idx !== this.current && !this.atLastJump()) {
      this.current = idx;
      this.updateCounter();
    }
  }

  // ---------------------------------------------------------------- minimap

  layoutMinimap(): void {
    if (!this.minimapEl) return;
    this.minimapEl.querySelectorAll('.rmd-marker').forEach((m) => m.remove());
    const total = this.scrollEl.scrollHeight;
    if (total > 0) {
      this.rows.forEach((row, i) => {
        if (row.type === 'equal') return;
        const el = this.rowEls[i];
        if (!el || el.hasClass('rmd-hidden')) return;
        const marker = this.minimapEl.createDiv(`rmd-marker rmd-marker-${row.type}`);
        marker.style.top = `${(el.offsetTop / total) * 100}%`;
        marker.style.height = `max(3px, ${(el.offsetHeight / total) * 100}%)`;
      });
    }
    this.layoutViewport();
  }

  private layoutViewport(): void {
    const total = this.scrollEl.scrollHeight;
    if (!total) return;
    const s = this.viewportEl.style;
    s.top = `${(this.scrollEl.scrollTop / total) * 100}%`;
    s.height = `${Math.min(100, (this.scrollEl.clientHeight / total) * 100)}%`;
  }

  private registerMinimapEvents(): void {
    let dragging = false;
    const scrollToY = (clientY: number) => {
      const rect = this.minimapEl.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const target = ratio * this.scrollEl.scrollHeight - this.scrollEl.clientHeight / 2;
      this.scrollEl.scrollTop = Math.max(0, target);
    };
    this.registerDomEvent(this.minimapEl, 'mousedown', (e) => {
      dragging = true;
      scrollToY(e.clientY);
      e.preventDefault();
    });
    this.registerDomEvent(window, 'mousemove', (e) => {
      if (dragging) scrollToY(e.clientY);
    });
    this.registerDomEvent(window, 'mouseup', () => (dragging = false));
    this.registerDomEvent(
      this.minimapEl,
      'wheel',
      (e) => {
        this.scrollEl.scrollTop += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
  }

  // ---------------------------------------------------------------- links

  private registerLinkEvents(): void {
    this.registerDomEvent(this.bodyEl, 'click', (evt) => {
      const a = (evt.target as HTMLElement).closest('a.internal-link') as HTMLAnchorElement | null;
      if (!a) return;
      evt.preventDefault();
      const href = a.getAttribute('data-href') ?? a.getAttribute('href') ?? '';
      if (href) void this.app.workspace.openLinkText(href, this.file?.path ?? '', Keymap.isModEvent(evt));
    });
    this.registerDomEvent(this.bodyEl, 'mouseover', (evt) => {
      const a = (evt.target as HTMLElement).closest('a.internal-link') as HTMLAnchorElement | null;
      if (!a) return;
      this.app.workspace.trigger('hover-link', {
        event: evt,
        source: VIEW_TYPE,
        hoverParent: this,
        targetEl: a,
        linktext: a.getAttribute('data-href') ?? a.getAttribute('href') ?? '',
        sourcePath: this.file?.path ?? '',
      });
    });
  }
}
