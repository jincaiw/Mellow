/**
 * FileTree（PRD §14 / desktop-ui-design-spec §6 文件树）—— 从 App.tsx 增量抽取（阶段 2d）。
 * 纯展示 + 本地拖拽状态：层级、选中/当前高亮、展开、右键、拖入文件夹移动。
 * P3.2 虚拟化：先把「可见节点」（展开的文件夹下钻）扁平化为一维行序列，
 * 再经 VirtualRows 窗口化渲染——10k 节点时 DOM 行数有上界（Exit Gate）。
 */
import { useRef } from 'react';
import type { FileTreeNode } from '../../app-core/src';
import { VirtualRows } from './VirtualRows';

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
  const rows: FileTreeNode[] = [];
  const walk = (list: readonly FileTreeNode[]) => {
    for (const node of list) {
      rows.push(node);
      if (node.kind === 'folder' && node.expanded && node.children !== undefined) walk(node.children);
    }
  };
  walk(nodes);
  const renderRow = (index: number) => {
    const node = rows[index];
    return (
      <button
        type="button"
        className={`tree-row ${selectedPath === node.path ? 'selected' : ''} ${currentPath === node.path ? 'current' : ''}`}
        style={{ paddingLeft: 8 + node.depth * 14 }}
        title={node.path}
        draggable
        onDragStart={(e) => {
          draggedRef.current = node.path;
          // 写入 dataTransfer：拖入编辑区（iframe）由 engine drop 建链（Typora 拖拽建链）
          try {
            e.dataTransfer?.setData('text/plain', node.path);
            e.dataTransfer?.setData('application/x-mellow-file', node.path);
            if (e.dataTransfer !== null) e.dataTransfer.effectAllowed = 'copyMove';
          } catch { /* dataTransfer 不可用：树内移动仍走 draggedRef */ }
        }}
        onDragOver={(e) => { if (node.kind === 'folder') e.preventDefault(); }}
        onDrop={() => { if (node.kind === 'folder') onDrop(node.path, draggedRef.current); }}
        // P3.7（G4-SIDE-07）：dragend 清空内部拖拽源——树内拖拽结束后从 Finder/Explorer
        // 拖入文件 drop 到文件夹节点时，不得被残留的 draggedRef 误触发移动
        onDragEnd={() => { draggedRef.current = null; }}
        onClick={() => {
          onSelect(node.path);
          if (node.kind === 'file') onOpen(node.path);
        }}
        onDoubleClick={() => { if (node.kind === 'folder') onToggle(node.path); else onOpen(node.path); }}
        onContextMenu={(e) => onContextMenu(e, node.path)}
      >
        <span className="tree-disclosure" onClick={(e) => { e.stopPropagation(); if (node.kind === 'folder') onToggle(node.path); }}>
          {node.kind === 'folder' ? (node.expanded ? '▾' : '▸') : ''}
        </span>
        <span className={`tree-icon tree-icon-${node.kind}`} aria-hidden="true" />
        <span className="tree-name">{node.name}</span>
      </button>
    );
  };
  // resetKey 用节点总数：刷新/展开折叠导致扁平序列变化时作废实测高度缓存
  return <VirtualRows count={rows.length} estimateRowHeight={28} overscan={10} resetKey={rows.length} renderItem={renderRow} />;
}
