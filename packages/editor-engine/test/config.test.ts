import { DEFAULT_ENGINE_FEATURES, mergeEngineFeatures, readEngineFeaturesFromStorage } from '../src/config';

describe('engine feature config (PRD §94)', () => {
  test('defaults: Typora 对齐（ADR-0034，2026-11-03）——扩展语法默认关，显式语法默认开', () => {
    // Typora 1.14.9 frame.js DEFAULT_OPTIONS：enableHighlight/enableSubscript/
    // enableSuperscript/enableDiagram 均为 !1 ⇒ Mellow 默认对齐为 false
    expect(DEFAULT_ENGINE_FEATURES.highlight).toBe(false);
    expect(DEFAULT_ENGINE_FEATURES.subscript).toBe(false);
    expect(DEFAULT_ENGINE_FEATURES.superscript).toBe(false);
    expect(DEFAULT_ENGINE_FEATURES.mermaid).toBe(false);
    // 其余（math/toc/footnote/…）不改变普通文本渲染 ⇒ 维持开启
    expect(DEFAULT_ENGINE_FEATURES.math).toBe(true);
    expect(DEFAULT_ENGINE_FEATURES.wikilink).toBe(true);
  });

  test('merge partial overrides keep defaults', () => {
    const f = mergeEngineFeatures({ math: false, mermaid: true });
    expect(f.math).toBe(false);
    expect(f.mermaid).toBe(true);
    expect(f.highlight).toBe(false);
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
