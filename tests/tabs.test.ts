// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Tabs } from '../src/ui/tabs';

type Id = 'one' | 'two' | 'three';
let onChange: ReturnType<typeof vi.fn<(id: Id) => void>>;
let tabs: Tabs<Id>;
const tab = (id: string): HTMLButtonElement =>
  document.querySelector(`[data-tab="${id}"]`) as HTMLButtonElement;
const panel = (id: string): HTMLElement => document.getElementById(`p-${id}`) as HTMLElement;

beforeEach(() => {
  document.body.innerHTML = `
    <div role="tablist" id="list">
      <button role="tab" data-tab="one" aria-controls="p-one" aria-selected="true">One</button>
      <button role="tab" data-tab="two" aria-controls="p-two">Two</button>
      <button role="tab" data-tab="three" aria-controls="p-three">Three</button>
    </div>
    <div role="tabpanel" id="p-one"></div>
    <div role="tabpanel" id="p-two"></div>
    <div role="tabpanel" id="p-three"></div>`;
  onChange = vi.fn<(id: Id) => void>();
  tabs = new Tabs<Id>(document.getElementById('list') as HTMLElement, onChange);
});

function press(key: string): void {
  (document.activeElement as HTMLElement).dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true }),
  );
}

describe('Tabs', () => {
  it('starts on the marked tab with one tab stop and other panels hidden', () => {
    expect(tabs.selected).toBe('one');
    expect([tab('one').tabIndex, tab('two').tabIndex]).toEqual([0, -1]);
    expect([panel('one').hidden, panel('two').hidden]).toEqual([false, true]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches on click and reports the change once', () => {
    tab('two').click();
    tab('two').click();
    expect(tabs.selected).toBe('two');
    expect(tab('two').getAttribute('aria-selected')).toBe('true');
    expect(tab('one').getAttribute('aria-selected')).toBe('false');
    expect(panel('two').hidden).toBe(false);
    expect(panel('one').hidden).toBe(true);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('two');
  });

  it('moves with arrow keys, wrapping, and Home/End', () => {
    tab('one').focus();
    press('ArrowLeft');
    expect(document.activeElement).toBe(tab('three'));
    press('ArrowRight');
    expect(tabs.selected).toBe('one');
    press('End');
    expect(tabs.selected).toBe('three');
    press('Home');
    expect(document.activeElement).toBe(tab('one'));
  });

  it('can select silently from code', () => {
    tabs.select('three', { notify: false });
    expect(tabs.selected).toBe('three');
    expect(onChange).not.toHaveBeenCalled();
  });
});
