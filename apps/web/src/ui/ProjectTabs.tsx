import React from 'react';
import { Plus, X } from 'lucide-react';
import type { StudioProjectMeta } from '../session/studioProjects';
import { ICON_SIZE, ICON_STROKE } from './icons';

type ProjectTabsProps = {
  projects: StudioProjectMeta[];
  activeId: string | null;
  disabled?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  canDelete: boolean;
};

export function ProjectTabs({
  projects,
  activeId,
  disabled = false,
  onSelect,
  onNew,
  onRename,
  onDelete,
  canDelete,
}: ProjectTabsProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState('');

  function startRename(project: StudioProjectMeta) {
    if (disabled) return;
    setEditingId(project.id);
    setDraftName(project.name);
  }

  function commitRename() {
    if (!editingId) return;
    onRename(editingId, draftName);
    setEditingId(null);
  }

  return (
    <nav className="transport-projects" aria-label="Projects">
      <div className="transport-projects-tabs" role="tablist">
        {projects.map((project) => {
          const active = project.id === activeId;
          if (editingId === project.id) {
            return (
              <input
                key={project.id}
                className="transport-project-input"
                value={draftName}
                maxLength={48}
                autoFocus
                aria-label="Project name"
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  }
                  if (e.key === 'Escape') {
                    setEditingId(null);
                  }
                }}
              />
            );
          }
          return (
            <div
              key={project.id}
              className={`transport-project-tab-wrap${active ? ' transport-project-tab-wrap--active' : ''}`}
            >
              <button
                type="button"
                role="tab"
                className={`transport-project-tab${active ? ' transport-project-tab--active' : ''}`}
                aria-selected={active}
                disabled={disabled}
                title={active ? 'Double-click to rename' : `Open ${project.name}`}
                onClick={() => onSelect(project.id)}
                onDoubleClick={() => startRename(project)}
              >
                {project.name}
              </button>
              {canDelete ? (
                <button
                  type="button"
                  className="transport-project-delete"
                  disabled={disabled}
                  title={`Delete ${project.name}`}
                  aria-label={`Delete ${project.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(project.id);
                  }}
                >
                  <X size={14} strokeWidth={ICON_STROKE} aria-hidden />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="transport-project-new"
        disabled={disabled}
        title="New project"
        aria-label="New project"
        onClick={onNew}
      >
        <Plus size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
      </button>
    </nav>
  );
}
