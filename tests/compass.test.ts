// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createCompass, describeWindForScreenReader } from '../src/ui/compass';
import { renderMetrics } from '../src/ui/conditionsView';

describe('compass', () => {
  it('points the arrow downwind (from SW means toward NE)', () => {
    const compass = createCompass(225, 10);
    const arrow = compass.querySelector('.compass__arrow');
    expect(arrow?.getAttribute('transform')).toBe('rotate(45 50 50)');
    expect(compass.getAttribute('aria-label')).toBe('Wind from the southwest');
  });

  it('shows a calm marker instead of an arrow', () => {
    const compass = createCompass(90, 0);
    expect(compass.querySelector('.compass__arrow')).toBeNull();
    expect(compass.querySelector('.compass__calm')).not.toBeNull();
    expect(describeWindForScreenReader(90, 0)).toBe('Wind calm');
  });

  it('has no arrow when direction is unknown', () => {
    expect(createCompass(null, 8).querySelector('.compass__arrow')).toBeNull();
  });
});

describe('renderMetrics', () => {
  it('renders all values with units and the wind text', () => {
    const element = renderMetrics({
      temperatureF: 71.6,
      relativeHumidity: 22.4,
      wind: { speedMph: 9.2, gustMph: 18, directionDeg: 200 },
    });
    const text = element.textContent;
    expect(text).toContain('72°F');
    expect(text).toContain('22%');
    expect(text).toContain('9 mph');
    expect(text).toContain('From SSW (200°)');
    expect(text).toContain('Gusts 18 mph');
  });

  it('labels missing values as not reported', () => {
    const element = renderMetrics({
      temperatureF: 50,
      relativeHumidity: null,
      wind: { speedMph: null, gustMph: null, directionDeg: null },
    });
    expect(element.textContent).toContain('Not reported');
    expect(element.textContent).toContain('Direction not reported');
  });

  it('flags empty fields so they render as secondary text', () => {
    const element = renderMetrics({
      temperatureF: 50,
      relativeHumidity: null,
      wind: { speedMph: null, gustMph: 18, directionDeg: null },
    });
    const flagged = [...element.querySelectorAll('[data-unavailable="true"]')];
    expect(flagged).toHaveLength(2);
    expect(element.querySelector('.wind__speed')?.getAttribute('data-unavailable')).toBe('true');
    expect(element.querySelector('.metric--temperature [data-unavailable]')).toBeNull();
    expect(element.textContent).toContain('Gusts 18 mph');
  });

  it('never injects markup from data', () => {
    const element = renderMetrics({
      temperatureF: null,
      relativeHumidity: null,
      wind: { speedMph: null, gustMph: null, directionDeg: null },
    });
    expect(element.querySelector('script')).toBeNull();
  });
});
