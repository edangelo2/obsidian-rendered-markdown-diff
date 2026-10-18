import { App, PluginSettingTab, Setting } from 'obsidian';
import { t } from './i18n';
import type RenderedDiffPlugin from './main';

export interface RenderedDiffSettings {
  gitPath: string;
  openIn: 'tab' | 'split';
  defaultLeft: 'HEAD' | 'INDEX';
  wordDiff: boolean;
  collapse: boolean;
  context: number;
  commits: number;
}

export const DEFAULT_SETTINGS: RenderedDiffSettings = {
  gitPath: '',
  openIn: 'tab',
  defaultLeft: 'HEAD',
  wordDiff: true,
  collapse: false,
  context: 2,
  commits: 30,
};

export class RenderedDiffSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: RenderedDiffPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    const save = async () => {
      await this.plugin.saveSettings();
    };

    new Setting(containerEl)
      .setName(t.sDefaultLeft)
      .addDropdown((d) =>
        d
          .addOption('HEAD', t.head)
          .addOption('INDEX', t.index)
          .setValue(s.defaultLeft)
          .onChange(async (v) => {
            s.defaultLeft = v as RenderedDiffSettings['defaultLeft'];
            await save();
          }),
      );

    new Setting(containerEl)
      .setName(t.sOpenIn)
      .addDropdown((d) =>
        d
          .addOption('tab', t.sOpenInTab)
          .addOption('split', t.sOpenInSplit)
          .setValue(s.openIn)
          .onChange(async (v) => {
            s.openIn = v as RenderedDiffSettings['openIn'];
            await save();
          }),
      );

    new Setting(containerEl)
      .setName(t.sWordDiff)
      .setDesc(t.sWordDiffDesc)
      .addToggle((tg) =>
        tg.setValue(s.wordDiff).onChange(async (v) => {
          s.wordDiff = v;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName(t.sCollapse)
      .setDesc(t.sCollapseDesc)
      .addToggle((tg) =>
        tg.setValue(s.collapse).onChange(async (v) => {
          s.collapse = v;
          await save();
        }),
      );

    new Setting(containerEl)
      .setName(t.sContext)
      .setDesc(t.sContextDesc)
      .addSlider((sl) =>
        sl
          .setLimits(0, 10, 1)
          .setValue(s.context)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.context = v;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName(t.sCommits)
      .addSlider((sl) =>
        sl
          .setLimits(5, 200, 5)
          .setValue(s.commits)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.commits = v;
            await save();
          }),
      );

    new Setting(containerEl)
      .setName(t.sGitPath)
      .setDesc(t.sGitPathDesc)
      .addText((tx) =>
        tx
          .setPlaceholder('/opt/homebrew/bin/git')
          .setValue(s.gitPath)
          .onChange(async (v) => {
            s.gitPath = v.trim();
            this.plugin.git.reset();
            await save();
          }),
      );
  }
}
