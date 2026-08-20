/**
 * host-api —— DesktopHost 聚合（PRD §116 + notification/opener）。
 */

import type {
  FileService,
  DialogService,
  ClipboardService,
  WindowService,
  WatchService,
  SearchService,
  ExportService,
  KeychainService,
  ProcessService,
  NotificationService,
  OpenerService,
  RecoveryStorage,
  ImageUploadService,
} from './services';

/** 宿主整体：所有系统能力（平台实现在 Adapter 层，见 PRD §113.4） */
export interface DesktopHost {
  fs: FileService;
  dialog: DialogService;
  clipboard: ClipboardService;
  window: WindowService;
  watcher: WatchService;
  search: SearchService;
  export: ExportService;
  keychain: KeychainService;
  process: ProcessService;
  notification: NotificationService;
  opener: OpenerService;
  recovery: RecoveryStorage;
  imageUpload: ImageUploadService;
}

export type {
  FileService,
  DialogService,
  ClipboardService,
  WindowService,
  WatchService,
  SearchService,
  ExportService,
  KeychainService,
  ProcessService,
  NotificationService,
  OpenerService,
  RecoveryStorage,
  ImageUploadService,
};
