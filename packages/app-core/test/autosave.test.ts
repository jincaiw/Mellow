import {
  DEFAULT_AUTOSAVE_MINUTES,
  MIN_AUTOSAVE_MINUTES,
  MAX_AUTOSAVE_MINUTES,
  parseAutosaveMinutes,
  isAutosaveEnabled,
  autosaveIntervalMs,
} from '../src/autosave';

describe('autosave (PRD §101 / Typora Auto Save 对标, G7-FEAT-03)', () => {
  test('默认间隔 = 5 分钟（Typora conf.user.json autoSaveTimer 官方默认值）', () => {
    expect(DEFAULT_AUTOSAVE_MINUTES).toBe(5);
    expect(parseAutosaveMinutes(null)).toBe(5);
    expect(autosaveIntervalMs(5)).toBe(5 * 60_000);
  });

  test('合法值解析（含小数；Typora autoSaveTimer 为 Double）', () => {
    expect(parseAutosaveMinutes('1')).toBe(1);
    expect(parseAutosaveMinutes('10')).toBe(10);
    expect(parseAutosaveMinutes('2.5')).toBe(2.5);
    expect(parseAutosaveMinutes(' 3 ')).toBe(3);
  });

  test('非法值回退默认（空串 / 非数字 / 0 / 负数 / 超上限）', () => {
    expect(parseAutosaveMinutes('')).toBe(DEFAULT_AUTOSAVE_MINUTES);
    expect(parseAutosaveMinutes('abc')).toBe(DEFAULT_AUTOSAVE_MINUTES);
    expect(parseAutosaveMinutes('0')).toBe(DEFAULT_AUTOSAVE_MINUTES);
    expect(parseAutosaveMinutes('-2')).toBe(DEFAULT_AUTOSAVE_MINUTES);
    expect(parseAutosaveMinutes('Infinity')).toBe(DEFAULT_AUTOSAVE_MINUTES);
    expect(parseAutosaveMinutes(String(MAX_AUTOSAVE_MINUTES + 1))).toBe(DEFAULT_AUTOSAVE_MINUTES);
  });

  test('次分钟值夹紧到下界（不回退：保留用户「更频繁」的意图）', () => {
    expect(parseAutosaveMinutes('0.5')).toBe(MIN_AUTOSAVE_MINUTES);
    expect(parseAutosaveMinutes('0.1')).toBe(MIN_AUTOSAVE_MINUTES);
  });

  test('开关默认开启，只有显式 "0" 才关闭', () => {
    expect(isAutosaveEnabled(null)).toBe(true);
    expect(isAutosaveEnabled(undefined)).toBe(true);
    expect(isAutosaveEnabled('1')).toBe(true);
    expect(isAutosaveEnabled('')).toBe(true);
    expect(isAutosaveEnabled('0')).toBe(false);
  });

  test('autosaveIntervalMs 对非法入参同样回退（防御宿主直传未校验值）', () => {
    expect(autosaveIntervalMs(Number.NaN)).toBe(DEFAULT_AUTOSAVE_MINUTES * 60_000);
    expect(autosaveIntervalMs(0)).toBe(DEFAULT_AUTOSAVE_MINUTES * 60_000);
  });
});
