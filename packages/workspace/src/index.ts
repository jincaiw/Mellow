/**
 * workspace —— 工作区状态（文件夹/文件树，PRD §14-16）。
 * 契约骨架；树/列表/大纲 UI 属 Phase 3。
 */

export interface WorkspaceFile {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: WorkspaceFile[];
}

export interface WorkspaceState {
  rootPath: string | null;
  files: WorkspaceFile[];
  pinned: string[];
  recent: string[];
}

/** 最小工作区模型（无平台依赖，数据由宿主注入） */
export class WorkspaceModel {
  private state: WorkspaceState = { rootPath: null, files: [], pinned: [], recent: [] };

  get rootPath(): string | null { return this.state.rootPath; }
  get files(): WorkspaceFile[] { return this.state.files; }

  openFolder(rootPath: string, files: WorkspaceFile[]): void {
    this.state.rootPath = rootPath;
    this.state.files = files;
  }

  closeFolder(): void {
    this.state.rootPath = null;
    this.state.files = [];
  }
}
