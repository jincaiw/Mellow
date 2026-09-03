/**
 * desktop 装配：RecoveryStorage 实现（Adapter 层）。
 * - Tauri：invoke recovery_* 命令（AppData）
 * - 浏览器 dev：host-api mock（内存）
 */

import { invoke } from '@tauri-apps/api/core';
import { browserMockHost } from './browserMockHost';
import type { RecoveryStorage, RecoveryPayload, RecoveryEntry, Result } from '../../../../packages/host-api/src/index';
import { ok, err } from '../../../../packages/host-api/src/index';

interface TauriPayload {
  document_id: string;
  path: string | null;
  content: string;
  revision: number;
  encoding: string;
  eol: string;
  cursor: { anchor: number; head: number } | null;
  scroll: { top: number; left: number } | null;
  saved_at: number;
}

interface TauriEntry {
  document_id: string;
  path: string | null;
  revision: number;
  saved_at: number;
}

const toTauri = (p: RecoveryPayload): TauriPayload => ({
  document_id: p.documentId,
  path: p.path,
  content: p.content,
  revision: p.revision,
  encoding: p.encoding,
  eol: p.eol,
  cursor: p.cursor,
  scroll: p.scroll,
  saved_at: p.savedAt,
});

const fromTauriPayload = (p: TauriPayload): RecoveryPayload => ({
  documentId: p.document_id,
  path: p.path,
  content: p.content,
  revision: p.revision,
  encoding: p.encoding as RecoveryPayload['encoding'],
  eol: p.eol as RecoveryPayload['eol'],
  cursor: p.cursor,
  scroll: p.scroll,
  savedAt: p.saved_at,
});

const fromTauriEntry = (e: TauriEntry): RecoveryEntry => ({
  documentId: e.document_id,
  path: e.path,
  revision: e.revision,
  savedAt: e.saved_at,
});

export const tauriRecoveryStorage: RecoveryStorage = {
  async save(payload: RecoveryPayload): Promise<Result<void>> {
    try {
      await invoke('recovery_save', { payload: toTauri(payload) });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  async list(): Promise<Result<RecoveryEntry[]>> {
    try {
      const entries = await invoke<TauriEntry[]>('recovery_list');
      return ok(entries.map(fromTauriEntry));
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  async get(documentId: string): Promise<Result<RecoveryPayload | null>> {
    try {
      const p = await invoke<TauriPayload | null>('recovery_get', { documentId });
      return ok(p === null ? null : fromTauriPayload(p));
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
  async delete(documentId: string): Promise<Result<void>> {
    try {
      await invoke('recovery_delete', { documentId });
      return ok(undefined);
    } catch (e) {
      return err({ code: 'io', message: String(e) });
    }
  },
};

export const browserRecoveryStorage: RecoveryStorage = browserMockHost.recovery;

/** 按运行时选择实现（Adapter 装配点） */
export function createDesktopRecoveryStorage(): RecoveryStorage {
  // 与 fileServices 同一判定
  const isTauriRuntime = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return isTauriRuntime ? tauriRecoveryStorage : browserRecoveryStorage;
}
