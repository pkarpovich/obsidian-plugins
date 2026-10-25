import { Plugin, type View } from 'obsidian';

// The core file explorer has no command for this: its toolbar button toggles instead of
// collapsing. `tree.setCollapseAll` and `navFileContainerEl` are internal, read out of the
// 1.13.7 bundle, so both are optional here - a rename on upgrade costs the feature, not a throw.
interface FileExplorerInternals {
  tree?: { setCollapseAll?: (collapsed: boolean) => void };
  navFileContainerEl?: HTMLElement;
}

export default class CollapseAndTop extends Plugin {
  override async onload(): Promise<void> {
    this.addCommand({
      id: 'collapse-all-and-top',
      name: 'Collapse all folders and scroll to top',
      callback: () => this.collapseAndTop(),
    });
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
