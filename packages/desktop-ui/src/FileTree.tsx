/**
 * FileTree（PRD §14 / desktop-ui-design-spec §6 文件树）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示 + 本地拖拽状态：层级、选中/当前高亮、展开、双击、右键、拖入文件夹移动。
 */
import { useRef } from 'react';
import type { FileTreeNode } from '../../app-core/src';

export interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPath: string | null;
  currentPath: string | null;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
  onDrop: (targetDir: string, draggedPath: string | null) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
}

export function FileTree({ nodes, selectedPath, currentPath, onSelect, onToggle, onOpen, onDrop, onContextMenu }: FileTreeProps) {
  const draggedRef = useRef<string | null>(null);
  const renderNode = (node: FileTreeNode) => (
    <div key={node.path}>
      <button
        type="button"
        className={`tree-row ${selectedPath === node.path ? 'selected' : ''} ${currentPath === node.path ? 'current' : ''}`}
        style={{ paddingLeft: 8 + node.depth * 14 }}
        title={node.path}
        draggable
        onDragStart={() => { draggedRef.current = node.path; }}
        onDragOver={(e) => { if (node.kind === 'folder') e.preventDefault(); }}
        onDrop={() => { if (node.kind === 'folder') onDrop(node.path, draggedRef.current); }}
        onClick={() => onSelect(node.path)}
        onDoubleClick={() => { if (node.kind === 'folder') onToggle(node.path); else onOpen(node.path); }}
        onContextMenu={(e) => onContextMenu(e, node.path)}
      >
        <span className="tree-disclosure" onClick={(e) => { e.stopPropagation(); if (node.kind === 'folder') onToggle(node.path); }}>
          {node.kind === 'folder' ? (node.expanded ? '▾' : '▸') : ''}
        </span>
        <span className="tree-icon">{node.kind === 'folder' ? '📁' : '📄'}</span>
        <span className="tree-name">{node.name}</span>
      </button>
      {node.kind === 'folder' && node.expanded && node.children !== undefined && node.children.map(renderNode)}
    </div>
  );
  return <>{nodes.map(renderNode)}</>;
}
