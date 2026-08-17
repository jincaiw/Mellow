import { stripImageSize } from '../src/image/path';
import { parseImageNode } from '../src/image/widget';

describe('image size syntax (Typora =WxH)', () => {
  test('stripImageSize: no size suffix → unchanged', () => {
    expect(stripImageSize('img.png')).toEqual({ src: 'img.png', size: null });
    expect(stripImageSize('https://example.com/a.png')).toEqual({ src: 'https://example.com/a.png', size: null });
  });

  test('stripImageSize: =WxH suffix parsed and stripped', () => {
    expect(stripImageSize('img.png =100x50')).toEqual({ src: 'img.png', size: { width: 100, height: 50 } });
    expect(stripImageSize('a/b.png =200X80')).toEqual({ src: 'a/b.png', size: { width: 200, height: 80 } });
  });

  test('parseImageNode: alt/src/size', () => {
    const p = parseImageNode('![alt](img.png =100x50)');
    expect(p).not.toBeNull();
    expect(p?.src).toBe('img.png');
    expect(p?.alt).toBe('alt');
    expect(p?.size).toEqual({ width: 100, height: 50 });
  });

  test('parseImageNode: without size → size null', () => {
    const p = parseImageNode('![alt](img.png)');
    expect(p?.size).toBeNull();
  });
});
