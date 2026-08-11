/**
 * app-core —— 应用核心逻辑入口。
 */

export { DocumentService, createAppServices } from './document';
export { RecoveryService } from './recovery';
export { ExternalChangeService } from './externalChange';
export type { ExternalChangeDetail, ExternalChangeServiceOptions } from './externalChange';
export { createEditorBridgeFromCore } from './editorBridge';
export type { EditorBridge, TextChange } from './editorBridge';
export { FileOpHistory, describeOp } from './fileOpHistory';
export type { FileOp, FileOpRecord } from './fileOpHistory';
export { ImageFileOpsService } from './imageFileOps';
export type { ImageFileOpsDeps, AssetSettingProvider } from './imageFileOps';
export { DocumentRenameService } from './documentRename';
export type { DocumentRenameDeps, RenameOutcome } from './documentRename';
