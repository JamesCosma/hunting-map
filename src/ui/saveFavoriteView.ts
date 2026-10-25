export type SaveState =
  | { kind: 'unsaved'; suggestedName: string }
  | { kind: 'saved'; name: string }
  | { kind: 'full'; max: number };

export interface SaveFavoriteViewOptions {
  /** Saves the current spot. Returns an error message to show, or null on success. */
  onSave: (name: string) => string | null;
  /** Called when the spot is already saved and the user taps the button. */
  onShowSaved: () => void;
}

/**
 * The "Save spot" button in the selected spot summary and its inline naming
 * form. The name defaults to the place name and keeps following it (when the
 * lookup finishes late) until the user edits it.
 */
export class SaveFavoriteView {
  private readonly toggle: HTMLButtonElement;
  private readonly label: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly message: HTMLElement;
  private readonly submit: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private state: SaveState = { kind: 'unsaved', suggestedName: '' };
  private edited = false;

  constructor(
    root: HTMLElement,
    private readonly options: SaveFavoriteViewOptions,
  ) {
    const find = <T extends HTMLElement>(selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (element == null) throw new Error(`Save favorite UI is missing ${selector}`);
      return element;
    };
    this.toggle = find<HTMLButtonElement>('[data-save-toggle]');
    this.label = find('[data-save-label]');
    this.form = find<HTMLFormElement>('[data-save-form]');
    this.input = find<HTMLInputElement>('[data-save-name]');
    this.message = find('[data-save-message]');
    this.submit = find<HTMLButtonElement>('[data-save-submit]');
    this.cancel = find<HTMLButtonElement>('[data-save-cancel]');

    this.toggle.addEventListener('click', () => {
      this.handleToggle();
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleSubmit();
    });
    this.cancel.addEventListener('click', () => {
      this.close({ restoreFocus: true });
    });
    this.input.addEventListener('input', () => {
      this.edited = true;
      this.setMessage('');
    });
    this.form.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close({ restoreFocus: true });
      }
    });
  }

  setState(state: SaveState): void {
    const previous = this.state;
    this.state = state;
    const saved = state.kind === 'saved';
    this.toggle.dataset.saved = String(saved);
    this.label.textContent = saved ? 'Saved' : 'Save spot';
    this.toggle.setAttribute(
      'aria-label',
      saved ? `Saved as ${state.name}. Show in favorites` : 'Save spot to favorites',
    );

    if (this.form.hidden) return;
    if (state.kind !== previous.kind) {
      this.close();
    } else if (state.kind === 'unsaved' && !this.edited) {
      this.input.value = state.suggestedName;
    }
  }

  /** Closes the form. Called after a successful save and when the selection changes. */
  close(options: { restoreFocus?: boolean } = {}): void {
    if (this.form.hidden) return;
    // Never strand keyboard focus inside a form that is about to disappear.
    const hadFocus = this.form.contains(document.activeElement);
    this.form.hidden = true;
    this.toggle.setAttribute('aria-expanded', 'false');
    this.setMessage('');
    if (options.restoreFocus === true || hadFocus) this.toggle.focus();
  }

  private handleToggle(): void {
    switch (this.state.kind) {
      case 'saved':
        this.options.onShowSaved();
        return;
      case 'full':
        this.open();
        this.input.hidden = true;
        this.submit.hidden = true;
        this.cancel.textContent = 'Close';
        this.setMessage(
          `You have ${this.state.max} favorites, the most this device can hold. Delete one to save this spot.`,
        );
        this.cancel.focus();
        return;
      case 'unsaved':
        if (!this.form.hidden) {
          this.close({ restoreFocus: true });
          return;
        }
        this.open();
        this.input.hidden = false;
        this.submit.hidden = false;
        this.cancel.textContent = 'Cancel';
        this.input.value = this.state.suggestedName;
        this.edited = false;
        this.input.focus();
        this.input.select();
    }
  }

  private open(): void {
    this.form.hidden = false;
    this.toggle.setAttribute('aria-expanded', 'true');
    this.setMessage('');
  }

  private handleSubmit(): void {
    if (this.state.kind !== 'unsaved') return;
    if (this.input.value.trim() === '') {
      this.setMessage('Enter a name for this spot.');
      this.input.focus();
      return;
    }
    const error = this.options.onSave(this.input.value);
    if (error == null) this.close({ restoreFocus: true });
    else this.setMessage(error);
  }

  private setMessage(text: string): void {
    this.message.textContent = text;
    this.message.hidden = text === '';
    if (text === '') this.input.removeAttribute('aria-invalid');
    else if (!this.input.hidden) this.input.setAttribute('aria-invalid', 'true');
  }
}
