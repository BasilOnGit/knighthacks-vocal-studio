import {
  Circle,
  Download,
  ICON_SIZE,
  ICON_STROKE,
  Pause,
  Play,
  Repeat,
  SlidersHorizontal,
} from './icons';
import { ToggleButton } from './ToggleButton';
import { ProjectTabs } from './ProjectTabs';
import type { StudioProjectMeta } from '../session/studioProjects';

function formatTransportTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

type TopBarProps = {
  pending?: boolean;
  playing: boolean;
  recording: boolean;
  canPlay: boolean;
  canExport: boolean;
  exporting?: boolean;
  positionSec: number;
  dry: boolean;
  loop: boolean;
  masterDb: number;
  onTogglePlay: () => void;
  onRecord: () => void;
  onDryChange: (dry: boolean) => void;
  onLoopChange: (loop: boolean) => void;
  onExport: () => void;
  onMasterDbChange: (db: number) => void;
  projects: StudioProjectMeta[];
  activeProjectId: string | null;
  projectsDisabled?: boolean;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  canDeleteProject: boolean;
};

export function TopBar({
  pending = false,
  playing,
  recording,
  canPlay,
  canExport,
  exporting = false,
  positionSec,
  dry,
  loop,
  masterDb,
  onTogglePlay,
  onRecord,
  onDryChange,
  onLoopChange,
  onExport,
  onMasterDbChange,
  projects,
  activeProjectId,
  projectsDisabled = false,
  onSelectProject,
  onNewProject,
  onRenameProject,
  onDeleteProject,
  canDeleteProject,
}: TopBarProps) {
  return (
    <header className="transport">
      <div className="transport-brand studio-wordmark">
        Waverio <span className="brand-sub">Studio</span>
      </div>
      <ProjectTabs
        projects={projects}
        activeId={activeProjectId}
        disabled={projectsDisabled}
        onSelect={onSelectProject}
        onNew={onNewProject}
        onRename={onRenameProject}
        onDelete={onDeleteProject}
        canDelete={canDeleteProject}
      />
      <div className="transport-center">
        <span className="transport-time" aria-label="Playback time">
          {formatTransportTime(positionSec)}
        </span>
        <div className="transport-buttons" role="group" aria-label="Transport">
          <button
            type="button"
            className={`transport-btn transport-btn--play${playing ? ' transport-btn--active' : ''}`}
            onClick={onTogglePlay}
            disabled={!canPlay || recording || pending}
            title={recording ? 'Stop recording with Space' : playing ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <>
                <Pause size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
                Pause
              </>
            ) : (
              <>
                <Play size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
                Play
              </>
            )}
          </button>
          <button
            type="button"
            className={`transport-btn transport-btn--record${recording ? ' transport-btn--recording' : ''}`}
            onClick={onRecord}
            disabled={pending}
            title={recording ? 'Double-click to stop · Space to stop' : 'Record'}
            aria-label={recording ? 'Recording — double-click to stop' : 'Record'}
          >
            <Circle size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
            {recording ? 'Recording' : 'Record'}
          </button>
        </div>
        <ToggleButton
          pressed={dry}
          onToggle={() => onDryChange(!dry)}
          title="Bypass all track effect chains (clips stay level/pan only)"
        >
          <SlidersHorizontal size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
          Bypass FX
        </ToggleButton>
        <ToggleButton pressed={loop} onToggle={() => onLoopChange(!loop)} title="Loop playback">
          <Repeat size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
          Loop
        </ToggleButton>
        <button
          type="button"
          className="transport-btn transport-btn--export"
          disabled={!canExport || exporting || recording || pending}
          onClick={onExport}
        >
          <Download size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </div>
      <label className="transport-master">
        <span className="transport-master-label">Master</span>
        <input
          type="range"
          className="transport-master-slider"
          min={-24}
          max={6}
          step={1}
          value={masterDb}
          onChange={(e) => onMasterDbChange(Number(e.target.value))}
          aria-describedby="master-hint"
        />
        <span className="transport-master-value">{masterDb} dB</span>
        <span id="master-hint" className="transport-master-hint">
          Output level
        </span>
      </label>
    </header>
  );
}
