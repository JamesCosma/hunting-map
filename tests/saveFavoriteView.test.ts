// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveFavoriteView } from '../src/ui/saveFavoriteView';

const MARKUP = `
  <section id="summary">
    <button data-save-toggle aria-expanded="false"><span data-save-label>Save spot</span></button>
    <form data-save-form hidden>
      <input data-save-name />
      <p data-save-message hidden></p>
      <button type="button" data-save-cancel>Cancel</button>
      <button type="submit" data-save-submit>Save</button>
    </form>
  </section>`;

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector) as T;

let onSave: ReturnType<typeof vi.fn<(name: string) => string | null>>;
let onShowSaved: ReturnType<typeof vi.fn<() => void>>;
let view: SaveFavoriteView;

beforeEach(() => {
  document.body.innerHTML = MARKUP;
  onSave = vi.fn<(name: string) => string | null>(() => null);
  onShowSaved = vi.fn<() => void>();
  view = new SaveFavoriteView($('#summary'), { onSave, onShowSaved });
});

function submit(): void {
  $<HTMLFormElement>('[data-save-form]').requestSubmit();
}

describe('SaveFavoriteView', () => {
  it('opens a form prefilled with the suggested name and focuses it', () => {
    view.setState({ kind: 'unsaved', suggestedName: 'Nye County, NV' });
    $('[data-save-toggle]').click();
    const input = $<HTMLInputElement>('[data-save-name]');
    expect($('[data-save-form]').hidden).toBe(false);
    expect($('[data-save-toggle]').getAttribute('aria-expanded')).toBe('true');
    expect(input.value).toBe('Nye County, NV');
    expect(document.activeElement).toBe(input);
  });

  it('follows a late place name until the user types', () => {
    view.setState({ kind: 'unsaved', suggestedName: 'Spot at 38.5000° N, 116.5000° W' });
    $('[data-save-toggle]').click();
    view.setState({ kind: 'unsaved', suggestedName: 'Nye County, NV' });
    const input = $<HTMLInputElement>('[data-save-name]');
    expect(input.value).toBe('Nye County, NV');
    input.value = 'Camp';
    input.dispatchEvent(new Event('input'));
    view.setState({ kind: 'unsaved', suggestedName: 'Something else' });
    expect(input.value).toBe('Camp');
  });

  it('saves the typed name and returns focus to the button', () => {
    view.setState({ kind: 'unsaved', suggestedName: 'Camp' });
    $('[data-save-toggle]').click();
    submit();
    expect(onSave).toHaveBeenCalledWith('Camp');
    expect($('[data-save-form]').hidden).toBe(true);
    expect(document.activeElement).toBe($('[data-save-toggle]'));
  });

  it('requires a name and shows errors from saving', () => {
    view.setState({ kind: 'unsaved', suggestedName: '' });
    $('[data-save-toggle]').click();
    submit();
    expect(onSave).not.toHaveBeenCalled();
    expect($('[data-save-message]').textContent).toBe('Enter a name for this spot.');
    expect($('[data-save-name]').getAttribute('aria-invalid')).toBe('true');

    onSave.mockReturnValueOnce('Storage is full.');
    $<HTMLInputElement>('[data-save-name]').value = 'Camp';
    submit();
    expect($('[data-save-form]').hidden).toBe(false);
    expect($('[data-save-message]').textContent).toBe('Storage is full.');
  });

  it('closes on Escape', () => {
    view.setState({ kind: 'unsaved', suggestedName: 'Camp' });
    $('[data-save-toggle]').click();
    $('[data-save-name]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect($('[data-save-form]').hidden).toBe(true);
  });

  it('shows the saved state and links to the favorite', () => {
    view.setState({ kind: 'saved', name: 'Camp' });
    expect($('[data-save-label]').textContent).toBe('Saved');
    expect($('[data-save-toggle]').getAttribute('aria-label')).toBe(
      'Saved as Camp. Show in favorites',
    );
    $('[data-save-toggle]').click();
    expect(onShowSaved).toHaveBeenCalledOnce();
    expect($('[data-save-form]').hidden).toBe(true);
  });

  it('explains the limit instead of saving when favorites are full', () => {
    view.setState({ kind: 'full', max: 25 });
    $('[data-save-toggle]').click();
    expect($('[data-save-name]').hidden).toBe(true);
    expect($('[data-save-submit]').hidden).toBe(true);
    expect($('[data-save-message]').textContent).toContain('You have 25 favorites');
  });
});
