export type StudioProjectMeta = {
  id: string;
  name: string;
  updatedAt: number;
};

export const MAX_STUDIO_PROJECTS = 16;

const INDEX_KEY = 'vocal-studio.projects.v1';
const ACTIVE_KEY = 'vocal-studio.active-project.v1';
export const LEGACY_SESSION_KEY = 'vocal-studio.session.v1';

export function sessionStorageKey(projectId: string): string {
  return `vocal-studio.session.v1.${projectId}`;
}

export function bufferStorageKey(projectId: string, clipId: string): string {
  return `${projectId}:${clipId}`;
}

type ProjectsIndex = {
  projects: StudioProjectMeta[];
  activeId: string;
};

function readRawIndex(): ProjectsIndex | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectsIndex;
    if (!parsed?.projects?.length || typeof parsed.activeId !== 'string') return null;
    const projects = parsed.projects.filter(
      (p) => p && typeof p.id === 'string' && typeof p.name === 'string',
    );
    if (!projects.length) return null;
    const activeId = projects.some((p) => p.id === parsed.activeId)
      ? parsed.activeId
      : projects[0].id;
    return { projects, activeId };
  } catch {
    return null;
  }
}

function writeIndex(index: ProjectsIndex): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function readProjectsState(): ProjectsIndex {
  const existing = readRawIndex();
  if (existing) return existing;
  return migrateLegacySessionToProjects();
}

function migrateLegacySessionToProjects(): ProjectsIndex {
  const id = crypto.randomUUID();
  const now = Date.now();
  const project: StudioProjectMeta = {
    id,
    name: 'My project',
    updatedAt: now,
  };
  if (typeof localStorage !== 'undefined') {
    const legacy = localStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      localStorage.setItem(sessionStorageKey(id), legacy);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
  }
  const index: ProjectsIndex = { projects: [project], activeId: id };
  writeIndex(index);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(ACTIVE_KEY, id);
  }
  return index;
}

export function getActiveProjectId(): string {
  if (typeof localStorage === 'undefined') return readProjectsState().activeId;
  const stored = localStorage.getItem(ACTIVE_KEY);
  const index = readRawIndex() ?? migrateLegacySessionToProjects();
  if (stored && index.projects.some((p) => p.id === stored)) return stored;
  return index.activeId;
}

export function setActiveProjectId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVE_KEY, id);
}

export function listProjects(): StudioProjectMeta[] {
  return [...readProjectsState().projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createStudioProject(name: string): StudioProjectMeta | null {
  const index = readProjectsState();
  if (index.projects.length >= MAX_STUDIO_PROJECTS) return null;
  const project: StudioProjectMeta = {
    id: crypto.randomUUID(),
    name: name.trim() || `Project ${index.projects.length + 1}`,
    updatedAt: Date.now(),
  };
  const next: ProjectsIndex = {
    projects: [project, ...index.projects],
    activeId: project.id,
  };
  writeIndex(next);
  setActiveProjectId(project.id);
  return project;
}

export function renameStudioProject(id: string, name: string): StudioProjectMeta[] {
  const label = name.trim();
  if (!label) return listProjects();
  const index = readProjectsState();
  const projects = index.projects.map((p) =>
    p.id === id ? { ...p, name: label.slice(0, 48), updatedAt: Date.now() } : p,
  );
  writeIndex({ ...index, projects });
  return listProjects();
}

export function touchStudioProject(id: string): StudioProjectMeta[] {
  const index = readProjectsState();
  const now = Date.now();
  const projects = index.projects.map((p) => (p.id === id ? { ...p, updatedAt: now } : p));
  writeIndex({ ...index, projects });
  return listProjects();
}

/** Removes a project from the index. Returns the new active id, or null if it is the only project. */
export function removeStudioProjectFromIndex(id: string): { activeId: string } | null {
  const index = readProjectsState();
  if (index.projects.length <= 1) return null;
  const projects = index.projects.filter((p) => p.id !== id);
  const activeId = index.activeId === id ? projects[0].id : index.activeId;
  writeIndex({ projects, activeId });
  setActiveProjectId(activeId);
  return { activeId };
}
