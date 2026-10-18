import { DiffView } from '../../src/view';
import { TFile } from './obsidian-mock';
import { DEFAULT_SETTINGS } from '../../src/settings';

declare const OLD_MD: string;
declare const NEW_MD: string;

const file = new TFile('AE/Reglas contables.md', 'Reglas contables');
const app = {
  scope: {},
  vault: {
    read: async () => NEW_MD,
    getAbstractFileByPath: () => file,
  },
  workspace: {
    requestSaveLayout() {},
    trigger() {},
    openLinkText: async (href: string) => ((window as any).lastLink = href),
  },
};
const commits = [
  { hash: 'a'.repeat(40), short: 'aaaaaaa', date: '2026-10-15', author: 'E', subject: 'Reglas: primera versión' },
  { hash: 'b'.repeat(40), short: 'bbbbbbb', date: '2026-10-01', author: 'E', subject: 'Esqueleto' },
];
const plugin = {
  settings: { ...DEFAULT_SETTINGS, ...((window as any).SETTINGS ?? {}) },
  git: {
    ensureRepo: async () => {},
    log: async () => commits,
    show: async (rev: string) => (rev === 'HEAD' ? OLD_MD : rev === '' ? OLD_MD : rev.startsWith('b') ? null : OLD_MD),
  },
  absolutePath: () => '/vault/AE/Reglas contables.md',
};
const leaf = { app };

(async () => {
  const view = new DiffView(leaf, plugin as any);
  view.load();
  document.getElementById('host')!.appendChild(view.containerEl);
  await view.onOpen();
  await view.setState({ file: file.path, left: 'HEAD', right: 'WORKING' }, {});
  (window as any).view = view;
  (window as any).ready = true;
})();
