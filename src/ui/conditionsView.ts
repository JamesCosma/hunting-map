import { h } from '../lib/dom';
import {
  formatAge,
  formatClockTime,
  formatDistance,
  formatElevation,
  formatHumidity,
  formatSpeed,
  formatTemperature,
  formatWindDirection,
  isCalm,
} from '../lib/format';
import type { Conditions, ModelEstimate, StationObservation } from '../types';
import { createCompass } from './compass';

/** Data attribute used by the age ticker to refresh "x min ago" labels. */
export const AGE_ATTRIBUTE = 'data-age-since';

function windSummary(conditions: Conditions): string {
  const { speedMph } = conditions.wind;
  return isCalm(speedMph) ? 'Calm' : formatSpeed(speedMph);
}

function gustText(conditions: Conditions): string | null {
  const { gustMph, speedMph } = conditions.wind;
  if (gustMph == null || (speedMph != null && gustMph <= speedMph)) return null;
  return `Gusts ${formatSpeed(gustMph)}`;
}

/** Marks a value that the source left empty so it can be styled as secondary text. */
function unavailableAttrs(value: number | null): Record<string, string> {
  return value == null ? { 'data-unavailable': 'true' } : {};
}

/** Temperature, humidity and wind, shared by both data sources so they compare at a glance. */
export function renderMetrics(conditions: Conditions): HTMLElement {
  const gust = gustText(conditions);
  return h('dl', { className: 'metrics' }, [
    h('div', { className: 'metric metric--temperature' }, [
      h('dt', { className: 'metric__label', text: 'Temperature' }),
      h('dd', {
        className: 'metric__value',
        text: formatTemperature(conditions.temperatureF),
        attrs: unavailableAttrs(conditions.temperatureF),
      }),
    ]),
    h('div', { className: 'metric metric--humidity' }, [
      h('dt', { className: 'metric__label', text: 'Humidity' }),
      h('dd', {
        className: 'metric__value',
        text: formatHumidity(conditions.relativeHumidity),
        attrs: unavailableAttrs(conditions.relativeHumidity),
      }),
    ]),
    h('div', { className: 'metric metric--wind' }, [
      h('dt', { className: 'metric__label', text: 'Wind' }),
      h('dd', { className: 'wind' }, [
        createCompass(conditions.wind.directionDeg, conditions.wind.speedMph),
        h('span', {
          className: 'metric__value wind__speed',
          text: windSummary(conditions),
          attrs: unavailableAttrs(conditions.wind.speedMph),
        }),
        h('span', {
          className: 'wind__direction',
          text: formatWindDirection(conditions.wind.directionDeg, conditions.wind.speedMph),
        }),
        gust == null ? null : h('span', { className: 'wind__gust', text: gust }),
      ]),
    ]),
  ]);
}

function ageLabel(date: Date): HTMLElement {
  return h('span', {
    text: formatAge(date),
    attrs: { [AGE_ATTRIBUTE]: date.toISOString(), title: date.toLocaleString('en-US') },
  });
}

export function renderStationObservation(observation: StationObservation): HTMLElement[] {
  const details = [`${formatDistance(observation.distanceMi)} away`];
  if (observation.elevationFt != null) {
    details.push(`station at ${formatElevation(observation.elevationFt)}`);
  }
  const skipped = observation.skippedCloser;
  return [
    h('div', { className: 'card__meta' }, [
      h('p', { className: 'card__source' }, [
        h('span', { className: 'card__source-name', text: observation.stationName }),
        h('span', { className: 'card__source-id', text: observation.stationId }),
      ]),
      h('p', { className: 'card__detail', text: details.join(', ') }),
      h('p', { className: 'card__detail' }, [
        'Reported ',
        ageLabel(observation.observedAt),
        ` at ${formatClockTime(observation.observedAt)}`,
      ]),
      skipped > 0
        ? h('p', {
            className: 'card__hint',
            text: `Skipped ${skipped} closer ${skipped === 1 ? 'station' : 'stations'} with no recent reading.`,
          })
        : null,
    ]),
    renderMetrics(observation.conditions),
  ];
}

export function renderModelEstimate(estimate: ModelEstimate): HTMLElement[] {
  return [
    h('div', { className: 'card__meta' }, [
      h('p', { className: 'card__detail' }, [
        `Open-Meteo, valid ${formatClockTime(estimate.validAt)} (`,
        ageLabel(estimate.validAt),
        ')',
      ]),
    ]),
    renderMetrics(estimate.conditions),
  ];
}

/** Refreshes every relative age label on the page. Called on a timer and on tab focus. */
export function refreshAgeLabels(root: ParentNode = document): void {
  const now = new Date();
  for (const element of root.querySelectorAll<HTMLElement>(`[${AGE_ATTRIBUTE}]`)) {
    const since = element.getAttribute(AGE_ATTRIBUTE);
    if (since != null) element.textContent = formatAge(new Date(since), now);
  }
}
