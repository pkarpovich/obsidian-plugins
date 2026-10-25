import type { App, Command, PluginManifest } from 'obsidian';

export class Plugin {
  readonly commands: Command[] = [];

  constructor(
    readonly app: App,
    readonly manifest: PluginManifest,
  ) {}

  addCommand(command: Command): Command {
    this.commands.push(command);
    return command;
  }
}
