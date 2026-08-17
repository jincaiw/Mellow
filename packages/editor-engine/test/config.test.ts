import { DEFAULT_ENGINE_FEATURES, mergeEngineFeatures, readEngineFeaturesFromStorage } from '../src/config';

describe('engine feature config (PRD §94)', () => {
  test('defaults: all features enabled', () => {
    expect(DEFAULT_ENGINE_FEATURES.highlight).toBe(true);
    expect(DEFAULT_ENGINE_FEATURES.math).toBe(true);
    expect(DEFAULT_ENGINE_FEATURES.mermaid).toBe(true);
    expect(DEFAULT_ENGINE_FEATURES.wikilink).toBe(true);
  });

  test('merge partial overrides keep defaults', () => {
    const f = mergeEngineFeatures({ math: false, mermaid: false });
    expect(f.math).toBe(false);
    expect(f.mermaid).toBe(false);
    expect(f.highlight).toBe(true);
    expect(f.toc).toBe(true);
  });

  test('empty / undefined merges to defaults', () => {
    expect(mergeEngineFeatures(undefined)).toEqual(DEFAULT_ENGINE_FEATURES);
    expect(mergeEngineFeatures({})).toEqual(DEFAULT_ENGINE_FEATURES);
  });

  test('read from storage returns null when unset or invalid', () => {
    expect(readEngineFeaturesFromStorage()).toBeNull();
    localStorage.setItem('mellow.engine.features', 'not-json');
    expect(readEngineFeaturesFromStorage()).toBeNull();
  });

  test('read from storage parses partial config', () => {
    localStorage.setItem('mellow.engine.features', JSON.stringify({ math: false }));
    const f = readEngineFeaturesFromStorage();
    expect(f).toEqual({ math: false });
  });
});
