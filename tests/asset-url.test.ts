import { describe, expect, it, vi } from 'vitest';
import {
  appBasePathFromLocation,
  changelogPageUrl,
  sampleBaseUrlForSampleDir,
} from '../src/app/asset-url';

describe('appBasePathFromLocation', () => {
  it('keeps trailing slash paths', () => {
    expect(appBasePathFromLocation('/Guitar-Fretboard-Visualization/')).toBe(
      '/Guitar-Fretboard-Visualization/',
    );
  });

  it('adds slash when pathname has no trailing slash', () => {
    expect(appBasePathFromLocation('/Guitar-Fretboard-Visualization')).toBe(
      '/Guitar-Fretboard-Visualization/',
    );
  });

  it('normalizes index.html paths', () => {
    expect(
      appBasePathFromLocation('/Guitar-Fretboard-Visualization/index.html'),
    ).toBe('/Guitar-Fretboard-Visualization/');
  });
});

describe('sampleBaseUrlForSampleDir', () => {
  it('builds absolute sample URLs from location', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'https://example.github.io',
        pathname: '/Guitar-Fretboard-Visualization',
        href: 'https://example.github.io/Guitar-Fretboard-Visualization',
      },
    });
    try {
      expect(sampleBaseUrlForSampleDir('steel-guitar')).toBe(
        'https://example.github.io/Guitar-Fretboard-Visualization/samples/steel-guitar/',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('changelogPageUrl', () => {
  it('builds absolute changelog URL from location', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'https://example.github.io',
        pathname: '/Guitar-Fretboard-Visualization/',
        href: 'https://example.github.io/Guitar-Fretboard-Visualization/',
      },
    });
    try {
      expect(changelogPageUrl()).toBe(
        'https://example.github.io/Guitar-Fretboard-Visualization/changelog.html',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
