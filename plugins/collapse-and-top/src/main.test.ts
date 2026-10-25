import type { App, PluginManifest, WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import type { Plugin as PluginStub } from '../../../test/obsidian';
import CollapseAndTop from './main';

interface Explorer {
  tree?: { setCollapseAll?: (collapsed: boolean) => void };
  navFileContainerEl?: { scrollTop: number };
  containerEl: { querySelector: (selector: string) => { scrollTop: number } | null };
}

function setup(explorer?: Explorer) {
  const revealLeaf = vi.fn(async () => {});
  const leaf = { view: explorer } as unknown as WorkspaceLeaf;
  const app = {
    workspace: {
      getLeavesOfType: (type: string) => (type === 'file-explorer' && explorer ? [leaf] : []),
      revealLeaf,
    },
  } as unknown as App;
  const plugin = new CollapseAndTop(app, {} as PluginManifest);
  return { plugin, revealLeaf };
}

async function run(plugin: CollapseAndTop): Promise<void> {
  await plugin.onload();
  const [command] = (plugin as unknown as PluginStub).commands;
  expect(command?.id).toBe('collapse-all-and-top');
  await command?.callback?.();
}

describe('collapse-and-top', () => {
  it('collapses every folder and scrolls the explorer to the top', async () => {
    const setCollapseAll = vi.fn();
    const scroller = { scrollTop: 420 };
    const { plugin, revealLeaf } = setup({
      tree: { setCollapseAll },
      navFileContainerEl: scroller,
      containerEl: { querySelector: () => null },
    });
    await run(plugin);
    expect(revealLeaf).toHaveBeenCalledOnce();
    expect(setCollapseAll).toHaveBeenCalledWith(true);
    expect(scroller.scrollTop).toBe(0);
  });

  it('falls back to the .nav-files-container element when the internal field is gone', async () => {
    const scroller = { scrollTop: 420 };
    const querySelector = vi.fn((selector: string) => (selector === '.nav-files-container' ? scroller : null));
    const { plugin } = setup({ tree: { setCollapseAll: vi.fn() }, containerEl: { querySelector } });
    await run(plugin);
    expect(scroller.scrollTop).toBe(0);
  });

  it('still scrolls when the internal tree api is gone', async () => {
    const scroller = { scrollTop: 420 };
    const { plugin } = setup({ navFileContainerEl: scroller, containerEl: { querySelector: () => null } });
    await run(plugin);
    expect(scroller.scrollTop).toBe(0);
  });

  it('does nothing without a file explorer', async () => {
    const { plugin, revealLeaf } = setup();
    await run(plugin);
    expect(revealLeaf).not.toHaveBeenCalled();
  });
});
