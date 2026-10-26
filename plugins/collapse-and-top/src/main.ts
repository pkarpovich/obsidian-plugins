import { Plugin, type View } from 'obsidian';

// The core file explorer has no command for this: its toolbar button toggles instead of
// collapsing. `tree.setCollapseAll`, `navFileContainerEl` and `headerDom.addNavButton` are
// internal, read out of the 1.14 bundle, so all are optional here - a rename on upgrade costs
// the feature, not a throw.
interface FileExplorerInternals {
  tree?: { setCollapseAll?: (collapsed: boolean) => void };
  navFileContainerEl?: HTMLElement;
  headerDom?: { addNavButton?: (icon: string, title: string, callback: () => void) => HTMLElement };
}

const NAME = 'Collapse all folders and scroll to top';

export default class CollapseAndTop extends Plugin {
  private readonly withButton = new WeakSet<View>();

  override async onload(): Promise<void> {
    this.addCommand({ id: 'collapse-all-and-top', name: NAME, callback: () => this.collapseAndTop() });
    this.app.workspace.onLayoutReady(() => this.addButtons());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.addButtons()));
  }

  private addButtons(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('file-explorer')) {
      const view = leaf.view as View & FileExplorerInternals;
      if (this.withButton.has(view)) {
        continue;
      }
      const button = view.headerDom?.addNavButton?.('lucide-arrow-up-to-line', NAME, () => void this.collapseAndTop());
      if (button) {
        this.withButton.add(view);
        this.register(() => button.remove());
      }
    }
  }

  private async collapseAndTop(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
    if (!leaf) {
      return;
    }
    await this.app.workspace.revealLeaf(leaf);

    const view = leaf.view as View & FileExplorerInternals;
    view.tree?.setCollapseAll?.(true);

    const scroller = view.navFileContainerEl ?? view.containerEl.querySelector('.nav-files-container');
    if (scroller) {
      scroller.scrollTop = 0;
    }
  }
}
