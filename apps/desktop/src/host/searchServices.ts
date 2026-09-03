/** Desktop SearchService：Tauri streaming search adapter（Rust backend）。 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { browserMockHost } from './browserMockHost';
import type { Result, SearchRequest, SearchResult, SearchService } from '../../../../packages/host-api/src/index';
import { err, ok } from '../../../../packages/host-api/src/index';
import { isTauri } from './fileServices';

interface TauriSearchEvent {
  searchId: string;
  eventType: 'match' | 'done' | 'error';
  result?: {
    path: string;
    line: number;
    column: number;
    matchText: string;
    snippet: string;
    before: string[];
    after: string[];
  } | null;
  error?: string | null;
}

function fromTauri(result: NonNullable<TauriSearchEvent['result']>): SearchResult {
  return {
    path: result.path,
    line: result.line,
    column: result.column,
    match: result.matchText,
    snippet: result.snippet,
    before: result.before,
    after: result.after,
  };
}

export const tauriSearchService: SearchService = {
  async searchFiles(query: string, directory: string): Promise<Result<SearchResult[]>> {
    const results: SearchResult[] = [];
    const started = await this.searchFilesStreaming?.({ root: directory, query, caseSensitive: false, wholeWord: false, regex: false, include: [], exclude: [], context: 1 }, (r) => results.push(r));
    if (!started?.ok) return started ?? err({ code: 'io', message: '搜索启动失败' });
    // 兼容旧 API：streaming 是主路径；这里不阻塞等待完成。
    return ok(results);
  },

  async searchFilesStreaming(request: SearchRequest, onResult: (result: SearchResult) => void): Promise<Result<{ cancel: () => void; done?: Promise<void> }>> {
    try {
      const searchId = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let resolveDone: () => void = () => undefined;
      const done = new Promise<void>((resolve) => { resolveDone = resolve; });
      const unlisten = await listen<TauriSearchEvent>('mellow://search-result', (event) => {
        const payload = event.payload;
        if (payload.searchId !== searchId) return;
        if (payload.eventType === 'match' && payload.result) onResult(fromTauri(payload.result));
        if (payload.eventType === 'done' || payload.eventType === 'error') {
          void unlisten();
          resolveDone();
        }
      });
      await invoke<string>('search_start', { searchId, request });
      return ok({ cancel: () => { void unlisten(); void invoke('search_cancel', { searchId }); resolveDone(); }, done });
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
};

export const browserSearchService: SearchService = browserMockHost.search;

export function createDesktopSearchService(): SearchService {
  return isTauri() ? tauriSearchService : browserSearchService;
}
