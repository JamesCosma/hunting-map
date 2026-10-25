/**
 * Accessible tabs following the WAI-ARIA tabs pattern: one tab stop for the
 * tab list (roving tabindex), arrow keys, Home and End move between tabs, and
 * activation follows focus. Markup supplies role="tab" buttons whose
 * aria-controls point at role="tabpanel" elements.
 */
export class Tabs<Id extends string> {
  private readonly tabs: HTMLButtonElement[];
  private current: Id;

  constructor(
    list: HTMLElement,
    private readonly onChange: (id: Id) => void = () => undefined,
  ) {
    this.tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    if (this.tabs.length === 0) throw new Error('Tab list has no tabs');
    const selected = this.tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
    this.current = this.idOf(selected ?? (this.tabs[0] as HTMLButtonElement));

    for (const tab of this.tabs) {
      tab.addEventListener('click', () => {
        this.select(this.idOf(tab));
      });
    }
    list.addEventListener('keydown', (event) => {
      this.handleKey(event);
    });
    this.select(this.current, { notify: false });
  }

  get selected(): Id {
    return this.current;
  }

  /** Shows a tab's panel. `focus` moves keyboard focus to the tab itself. */
  select(id: Id, options: { focus?: boolean; notify?: boolean } = {}): void {
    const changed = id !== this.current;
    this.current = id;
    for (const tab of this.tabs) {
      const active = this.idOf(tab) === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = this.panelOf(tab);
      if (panel != null) panel.hidden = !active;
      if (active && options.focus === true) tab.focus();
    }
    if (changed && options.notify !== false) this.onChange(id);
  }

  private handleKey(event: KeyboardEvent): void {
    const index = this.tabs.findIndex((tab) => tab === document.activeElement);
    if (index < 0) return;
    const last = this.tabs.length - 1;
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    const tab = this.tabs[next];
    if (tab != null) this.select(this.idOf(tab), { focus: true });
  }

  /** Tabs are identified by their `data-tab` attribute. */
  private idOf(tab: HTMLButtonElement): Id {
    const id = tab.dataset.tab;
    if (id == null) throw new Error('Tab is missing data-tab');
    return id as Id;
  }

  private panelOf(tab: HTMLButtonElement): HTMLElement | null {
    const id = tab.getAttribute('aria-controls');
    return id == null ? null : document.getElementById(id);
  }
}
