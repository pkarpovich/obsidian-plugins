import type { App, Command, EventRef, PluginManifest, RequestUrlParam } from 'obsidian';
import { vi } from 'vitest';

export class Plugin {
  readonly commands: Command[] = [];
  readonly settingTabs: unknown[] = [];

  constructor(
    readonly app: App,
    readonly manifest: PluginManifest,
  ) {}

  addCommand(command: Command): Command {
    this.commands.push(command);
    return command;
  }

  addSettingTab(tab: unknown): void {
    this.settingTabs.push(tab);
  }

  loadData(): Promise<unknown> {
    return Promise.resolve(null);
  }

  saveData(_data: unknown): Promise<void> {
    return Promise.resolve();
  }

  registerEvent(_ref: EventRef): void {}

  registerDomEvent(_el: unknown, _type: string, _callback: () => unknown): void {}

  registerInterval(id: number): number {
    return id;
  }
}

export class PluginSettingTab {
  constructor(
    readonly app: App,
    readonly plugin: Plugin,
  ) {}
}

export class Notice {
  static readonly messages: string[] = [];

  constructor(message: string) {
    Notice.messages.push(message);
  }
}

export const requestUrl = vi.fn<(request: RequestUrlParam) => Promise<{ status: number }>>();
