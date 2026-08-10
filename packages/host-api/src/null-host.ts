/**
 * host-api —— Null 实现（createNullHost）。
 *
 * 所有方法返回 { ok:false, error:{ code:'not-implemented' } }。
 * 用途：占位、未装配宿主的兜底、测试错误路径。
 */

import type { DesktopHost } from './host';
import type { Result } from './types';
import { err } from './types';

function notImplemented<T>(name: string): () => Promise<Result<T>> {
  return async () => err({ code: 'not-implemented', message: `${name} is not implemented` });
}

/** 创建全 not-implemented 宿主 */
export function createNullHost(): DesktopHost {
  return {
    fs: {
      open: notImplemented('fs.open'),
      openPath: notImplemented('fs.openPath'),
      save: notImplemented('fs.save'),
      readText: notImplemented('fs.readText'),
      writeText: notImplemented('fs.writeText'),
      readDir: notImplemented('fs.readDir'),
      exists: notImplemented('fs.exists'),
      rename: notImplemented('fs.rename'),
      delete: notImplemented('fs.delete'),
    },
    dialog: {
      showOpen: notImplemented('dialog.showOpen'),
      showSave: notImplemented('dialog.showSave'),
      showMessage: notImplemented('dialog.showMessage'),
      showConfirm: notImplemented('dialog.showConfirm'),
    },
    clipboard: {
      readText: notImplemented('clipboard.readText'),
      writeText: notImplemented('clipboard.writeText'),
      readHTML: notImplemented('clipboard.readHTML'),
      writeHTML: notImplemented('clipboard.writeHTML'),
      readImage: notImplemented('clipboard.readImage'),
      writeImage: notImplemented('clipboard.writeImage'),
    },
    window: {
      setTitle: notImplemented('window.setTitle'),
      setSize: notImplemented('window.setSize'),
      getSize: notImplemented('window.getSize'),
      getFocused: notImplemented('window.getFocused'),
      minimize: notImplemented('window.minimize'),
      maximize: notImplemented('window.maximize'),
      close: notImplemented('window.close'),
    },
    watcher: { watch: notImplemented('watcher.watch') },
    search: { searchFiles: notImplemented('search.searchFiles') },
    export: {
      exportPDF: notImplemented('export.exportPDF'),
      exportHTML: notImplemented('export.exportHTML'),
      print: notImplemented('export.print'),
    },
    keychain: {
      get: notImplemented('keychain.get'),
      set: notImplemented('keychain.set'),
      delete: notImplemented('keychain.delete'),
    },
    process: {
      spawn: notImplemented('process.spawn'),
      kill: notImplemented('process.kill'),
    },
    notification: { show: notImplemented('notification.show') },
    opener: {
      openPath: notImplemented('opener.openPath'),
      revealInFolder: notImplemented('opener.revealInFolder'),
      openUrl: notImplemented('opener.openUrl'),
    },
  };
}
