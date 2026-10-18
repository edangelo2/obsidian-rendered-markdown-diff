/* Minimal stand-in for the Obsidian API, enough to run DiffView in a browser. */
import MarkdownIt from 'markdown-it';

type Info = string | { cls?: string; text?: string; attr?: Record<string, string>; value?: string };

function apply(el: HTMLElement, o?: Info) {
  if (!o) return el;
  if (typeof o === 'string') {
    el.className = o;
    return el;
  }
  if (o.cls) el.className = o.cls;
  if (o.text !== undefined) el.textContent = o.text;
  if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
  if (o.value !== undefined) (el as HTMLInputElement).value = o.value;
  return el;
}

const P = HTMLElement.prototype as any;
P.createEl = function (tag: string, o?: Info) {
  const el = apply(document.createElement(tag), o);
  this.appendChild(el);
  return el;
};
P.createDiv = function (o?: Info) {
  return this.createEl('div', o);
};
P.createSpan = function (o?: Info) {
  return this.createEl('span', o);
};
P.empty = function () {
  while (this.firstChild) this.removeChild(this.firstChild);
};
P.addClass = function (...c: string[]) {
  c.forEach((x) => x.split(' ').forEach((y) => y && this.classList.add(y)));
};
P.removeClass = function (...c: string[]) {
  c.forEach((x) => this.classList.remove(x));
};
P.toggleClass = function (c: string, v: boolean) {
  this.classList.toggle(c, v);
};
P.hasClass = function (c: string) {
  return this.classList.contains(c);
};
P.setText = function (t: string) {
  this.textContent = t;
};
(window as any).createDiv = (o?: Info) => apply(document.createElement('div'), o);
(window as any).createEl = (tag: string, o?: Info) => apply(document.createElement(tag), o);

export class Component {
  _children: Component[] = [];
  _cleanups: Array<() => void> = [];
  _loaded = false;
  load() {
    this._loaded = true;
    this._children.forEach((c) => c.load());
  }
  unload() {
    this._children.forEach((c) => c.unload());
    this._cleanups.forEach((f) => f());
    this._cleanups = [];
    this._loaded = false;
  }
  addChild<T extends Component>(c: T): T {
    this._children.push(c);
    if (this._loaded) c.load();
    return c;
  }
  removeChild<T extends Component>(c: T): T {
    this._children = this._children.filter((x) => x !== c);
    c.unload();
    return c;
  }
  register(f: () => void) {
    this._cleanups.push(f);
  }
  registerDomEvent(el: EventTarget, type: string, cb: any, opts?: any) {
    el.addEventListener(type, cb, opts);
    this.register(() => el.removeEventListener(type, cb, opts));
  }
  registerEvent() {}
}

export class Scope {
  keys: Array<{ mods: string[]; key: string; fn: () => unknown }> = [];
  constructor(_parent?: unknown) {}
  register(mods: string[], key: string, fn: () => unknown) {
    this.keys.push({ mods, key, fn });
  }
}

export class ItemView extends Component {
  app: any;
  leaf: any;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  scope: Scope | null = null;
  constructor(leaf: any) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = (window as any).createDiv('workspace-leaf-content');
    this.contentEl = (this.containerEl as any).createDiv('view-content');
  }
  async setState(_s: unknown, _r: unknown) {}
}

export class TFile {
  constructor(
    public path: string,
    public basename: string,
    public extension = 'md',
  ) {}
}

export const Keymap = { isModEvent: () => false };

const ICONS: Record<string, string> = {
  'arrow-up': '↑',
  'arrow-down': '↓',
  'refresh-cw': '⟳',
  'fold-vertical': '⇕',
};
export function setIcon(el: HTMLElement, name: string) {
  el.textContent = ICONS[name] ?? '•';
}
export function setTooltip(el: HTMLElement, t: string) {
  el.title = t;
}

const md = new MarkdownIt({ html: true, linkify: true });

/** Rough imitation of Obsidian's renderer: wiki-links and callouts. */
export const MarkdownRenderer = {
  async render(_app: unknown, src: string, el: HTMLElement) {
    await new Promise((r) => setTimeout(r, Math.random() * 15));
    const withLinks = src.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) =>
      `<a class="internal-link" data-href="${target}" href="${target}">${alias ?? target}</a>`,
    );
    el.insertAdjacentHTML('beforeend', md.render(withLinks));
    el.querySelectorAll('blockquote').forEach((bq) => {
      const first = bq.querySelector('p');
      const m = first?.innerHTML.match(/^\[!(\w+)\]\s*([^\n<]*)/);
      if (!first || !m) return;
      const callout = document.createElement('div');
      callout.className = `callout callout-${m[1]}`;
      const title = document.createElement('div');
      title.className = 'callout-title';
      title.textContent = m[2] || m[1][0].toUpperCase() + m[1].slice(1);
      const body = document.createElement('div');
      body.className = 'callout-content';
      first.innerHTML = first.innerHTML.replace(/^\[!(\w+)\][^\n<]*(\n|<br>)?/, '');
      while (bq.firstChild) body.appendChild(bq.firstChild);
      callout.append(title, body);
      bq.replaceWith(callout);
    });
  },
};

export type ViewStateResult = Record<string, unknown>;
export type WorkspaceLeaf = any;
export class PluginSettingTab {}
export class Setting {}
export type App = any;
