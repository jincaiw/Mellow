import type { DocumentTab } from '../../app-core/src';

export interface TabbarProps {
  tabs: DocumentTab[];
  activeId: string | null;
  newLabel: string;
  closeLabel: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onReorder: (id: string, targetId: string) => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
}

/** Lightweight document tabs. It deliberately stays hidden for a single document. */
export function Tabbar({ tabs, activeId, newLabel, closeLabel, onActivate, onClose, onNew, onReorder, onContextMenu }: TabbarProps) {
  if (tabs.length < 2) return null;
  return <nav className="tabbar" aria-label="Documents">
    <div className="tabbar-list" role="tablist">
      {tabs.map((tab) => (
        <div key={tab.id} className={`tabbar-tab${tab.id === activeId ? ' active' : ''}`} role="presentation" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-mellow-tab', tab.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData('application/x-mellow-tab'); if (sourceId !== '') onReorder(sourceId, tab.id); }} onContextMenu={(event) => onContextMenu(event, tab.id)}>
          <button type="button" role="tab" aria-selected={tab.id === activeId} className="tabbar-title" title={tab.path ?? tab.title} onClick={() => onActivate(tab.id)}>
            {tab.dirty && <span className="tabbar-dirty" aria-label="Unsaved changes">●</span>}
            <span>{tab.title}</span>
          </button>
          <button type="button" className="tabbar-close" aria-label={closeLabel} title={closeLabel} onClick={(event) => { event.stopPropagation(); onClose(tab.id); }}>×</button>
        </div>
      ))}
    </div>
    <button type="button" className="tab-new" aria-label={newLabel} title={newLabel} onClick={onNew}>+</button>
  </nav>;
}
