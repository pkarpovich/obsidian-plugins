import type { App, PluginManifest, WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import type { Plugin as PluginStub } from '../../../test/obsidian';
import CollapseAndTop from './main';

interface Button {
  remove: () => void;
}

interface Explorer {
  tree?: { setCollapseAll?: (collapsed: boolean) => void };
  navFileContainerEl?: { scrollTop: number };
  containerEl: { querySelector: (selector: string) => { scrollTop: number } | null };
  headerDom?: { addNavButton: (icon: string, title: string, callback: () => void) => Button };
}

function setup(explorer?: Explorer) {
  const revealLeaf = vi.fn(async () => {});
  const layoutChanges: (() => void)[] = [];
  const leaves: WorkspaceLeaf[] = explorer ? [{ view: explorer } as unknown as WorkspaceLeaf] : [];
  const app = {
    workspace: {
      getLeavesOfType: (type: string) => (type === 'file-explorer' ? leaves : []),
      revealLeaf,
      onLayoutReady: (callback: () => void) => callback(),
      on: (name: string, callback: () => void) => {
        if (name === 'layout-change') {
          layoutChanges.push(callback);
        }
        return {};
      },
    },
  } as unknown as App;
  const plugin = new CollapseAndTop(app, {} as PluginManifest);
  const changeLayout = (): void => layoutChanges.forEach((callback) => callback());
  return { plugin, revealLeaf, leaves, changeLayout };
}

function header() {
  const button = { remove: vi.fn() };
  const callbacks: (() => void)[] = [];
  const addNavButton = vi.fn((_icon: string, _title: string, callback: () => void) => {
    callbacks.push(callback);
    return button;
  });
  return { headerDom: { addNavButton }, addNavButton, button, click: () => callbacks[0]?.() };
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

  it('adds one button to the explorer header that collapses and scrolls', async () => {
    const setCollapseAll = vi.fn();
    const scroller = { scrollTop: 420 };
    const nav = header();
    const { plugin, changeLayout } = setup({
      tree: { setCollapseAll },
      navFileContainerEl: scroller,
      containerEl: { querySelector: () => null },
      headerDom: nav.headerDom,
    });
    await plugin.onload();
    changeLayout();
    expect(nav.addNavButton).toHaveBeenCalledOnce();
    expect(nav.addNavButton).toHaveBeenCalledWith(
      'lucide-arrow-up-to-line',
      'Collapse all folders and scroll to top',
      expect.any(Function),
    );
    nav.click();
    await vi.waitFor(() => expect(scroller.scrollTop).toBe(0));
    expect(setCollapseAll).toHaveBeenCalledWith(true);
  });

  it('adds the button to an explorer opened after the layout is ready', async () => {
    const nav = header();
    const { plugin, leaves, changeLayout } = setup();
    await plugin.onload();
    leaves.push({
      view: { containerEl: { querySelector: () => null }, headerDom: nav.headerDom },
    } as unknown as WorkspaceLeaf);
    changeLayout();
    expect(nav.addNavButton).toHaveBeenCalledOnce();
  });

  it('removes the button on unload', async () => {
    const nav = header();
    const { plugin } = setup({ containerEl: { querySelector: () => null }, headerDom: nav.headerDom });
    await plugin.onload();
    (plugin as unknown as PluginStub).unload();
    expect(nav.button.remove).toHaveBeenCalledOnce();
  });

  it('loads without a header api', async () => {
    const { plugin, changeLayout } = setup({ containerEl: { querySelector: () => null } });
    await plugin.onload();
    expect(changeLayout).not.toThrow();
  });
});
