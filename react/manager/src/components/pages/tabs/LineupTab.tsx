// src/components/pages/tabs/LineupTab.tsx
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  RefreshCw,
  Users,
  Clock,
  Save,
  AlertCircle,
  CheckCircle2,
  ArrowLeftRight,
  ChevronDown,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { Player, Team } from '../../../shared/index';
import { leagueAPI, LineupData } from '../../../api/leagueApi';
import './styles/LineupTab.css';

// ── Constants ─────────────────────────────────────────────────────────────────
const TOTAL_MINUTES = 240; 
const STARTER_LABELS = ['PG', 'SG', 'SF', 'PF', 'C'];
const BENCH_SIZE = 7;


// Position accent colours, tuned to sit alongside the dashboard's neon-blue palette
const POSITION_COLOURS: Record<string, string> = {
  PG: '#7aa2f7',
  SG: '#9d7cd8',
  SF: '#6abf8d',
  PF: '#e0a84f',
  C: '#e06c75',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface LineupTabProps {
  savedGameId: string;
  userTeam: Team | undefined;
  allPlayers: Player[];
}

type DraftMinutes = Record<string, number>;
type SlotId = string; // e.g. "starter-0" | "bench-3"

// ── Helpers ───────────────────────────────────────────────────────────────────
function totalDraft(draft: DraftMinutes, ids: (string | null)[]): number {
  return ids.reduce((sum: number, id) => sum + (id ? draft[id] ?? 0 : 0), 0);
}

function budgetColour(total: number): string {
  const diff = Math.abs(total - TOTAL_MINUTES);
  if (diff === 0) return '#22d3ee';
  if (diff <= 5) return '#f59e0b';
  return '#ef4444';
}

function ratingClass(r: number): string {
  if (r >= 85) return 'lineup-rating--elite';
  if (r >= 70) return 'lineup-rating--good';
  return 'lineup-rating--average';
}

function getPlayerName(p: Player | null): string {
  if (!p) return '';
  return p.full_name ?? `${(p as any).first_name ?? ''} ${(p as any).last_name ?? ''}`.trim();
}

// ── SwapMenu ──────────────────────────────────────────────────────────────────
interface SwapMenuProps {
  currentSlot: SlotId;
  eligible: { slot: SlotId; label: string; player: Player }[];
  onSwap: (targetSlot: SlotId) => void;
  onClose: () => void;
}

const SwapMenu: React.FC<SwapMenuProps> = ({ eligible, onSwap, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="swap-menu-popover" ref={ref}>
      <div className="swap-menu-header">
        <span>Swap With</span>
        <button className="swap-menu-close" onClick={onClose}>
          <X size={12} />
        </button>
      </div>
      <div className="swap-menu-list">
        {eligible.length === 0 && (
          <div className="swap-menu-empty">No eligible players</div>
        )}
        {eligible.map(({ slot, label, player }) => (
          <button key={slot} className="swap-menu-item" onClick={() => onSwap(slot)}>
            <span
              className="swap-menu-slot"
              style={{
                backgroundColor: `${POSITION_COLOURS[player.position] ?? '#94a3b8'}20`,
                color: POSITION_COLOURS[player.position] ?? '#94a3b8',
              }}
            >
              {label}
            </span>
            <span className="swap-menu-name">{getPlayerName(player)}</span>
            <span className="swap-menu-ovr">{player.overall_rating}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ── PlayerRow ─────────────────────────────────────────────────────────────────
interface PlayerRowProps {
  slotId: SlotId;
  player: Player;
  slotLabel: string;
  isStarter: boolean;
  minutes: number;
  onChangeMinutes: (playerId: string, value: number) => void;
  swapMenuOpen: boolean;
  onToggleSwapMenu: (slotId: SlotId | null) => void;
  eligibleForSwap: { slot: SlotId; label: string; player: Player }[];
  onSwap: (fromSlot: SlotId, toSlot: SlotId) => void;
}

const PlayerRow: React.FC<PlayerRowProps> = ({
  slotId,
  player,
  slotLabel,
  isStarter,
  minutes,
  onChangeMinutes,
  swapMenuOpen,
  onToggleSwapMenu,
  eligibleForSwap,
  onSwap,
}) => {
  const colour = POSITION_COLOURS[player.position] ?? '#94a3b8';

  const clamp = (v: number) => Math.max(0, Math.min(48, v));

  const handleNumber = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (Number.isNaN(raw)) {
      onChangeMinutes(player.id, 0);
      return;
    }
    onChangeMinutes(player.id, clamp(raw));
  };

  const step = (delta: number) => onChangeMinutes(player.id, clamp(minutes + delta));

  return (
    <div className={`lineup-player-card ${isStarter ? 'lineup-player-card--starter' : ''}`}>
      <div className="lineup-player-identity">
        <div className="lineup-slot-label" style={{ backgroundColor: `${colour}20`, color: colour }}>
          {slotLabel}
        </div>
        <div className="lineup-player-meta">
          <span className="lineup-player-name">{getPlayerName(player)}</span>
          <span className="lineup-player-pos-tag">{player.position}</span>
        </div>
      </div>

      <div className="lineup-player-stats">
        <div className={`lineup-rating-badge ${ratingClass(player.overall_rating)}`}>
          OVR {player.overall_rating}
        </div>

        <div className="lineup-minutes-input-wrapper">
          <Clock size={13} className="input-clock-icon" />
          <button type="button" className="minutes-step-btn" onClick={() => step(-1)} tabIndex={-1}>
            <Minus size={12} />
          </button>
          <input
            type="number"
            className="lineup-minutes-input"
            value={minutes}
            onChange={handleNumber}
            min={0}
            max={48}
          />
          <button type="button" className="minutes-step-btn" onClick={() => step(1)} tabIndex={-1}>
            <Plus size={12} />
          </button>
          <span className="input-unit-label">m</span>
        </div>

        <div className="swap-control">
          <button
            type="button"
            className={`swap-trigger-btn ${swapMenuOpen ? 'swap-trigger-btn--active' : ''}`}
            onClick={() => onToggleSwapMenu(swapMenuOpen ? null : slotId)}
            title="Swap player"
          >
            <ArrowLeftRight size={14} />
            <ChevronDown size={12} />
          </button>
          {swapMenuOpen && (
            <SwapMenu
              currentSlot={slotId}
              eligible={eligibleForSwap}
              onSwap={(targetSlot) => onSwap(slotId, targetSlot)}
              onClose={() => onToggleSwapMenu(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── EmptySlot ─────────────────────────────────────────────────────────────────
interface EmptySlotProps {
  slotId: SlotId;
  slotLabel: string;
  swapMenuOpen: boolean;
  onToggleSwapMenu: (slotId: SlotId | null) => void;
  eligibleForSwap: { slot: SlotId; label: string; player: Player }[];
  onSwap: (fromSlot: SlotId, toSlot: SlotId) => void;
}

const EmptySlot: React.FC<EmptySlotProps> = ({
  slotId,
  slotLabel,
  swapMenuOpen,
  onToggleSwapMenu,
  eligibleForSwap,
  onSwap,
}) => (
  <div className="lineup-player-card lineup-player-card--empty">
    <div className="lineup-player-identity">
      <div className="lineup-slot-label empty-label">{slotLabel}</div>
      <span className="lineup-player-name empty-text">Unassigned Roster Position</span>
    </div>
    <div className="swap-control">
      <button
        type="button"
        className={`swap-trigger-btn ${swapMenuOpen ? 'swap-trigger-btn--active' : ''}`}
        onClick={() => onToggleSwapMenu(swapMenuOpen ? null : slotId)}
        title="Assign player"
      >
        <ArrowLeftRight size={14} />
        <ChevronDown size={12} />
      </button>
      {swapMenuOpen && (
        <SwapMenu
          currentSlot={slotId}
          eligible={eligibleForSwap}
          onSwap={(targetSlot) => onSwap(slotId, targetSlot)}
          onClose={() => onToggleSwapMenu(null)}
        />
      )}
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const LineupTab: React.FC<LineupTabProps> = ({ savedGameId, userTeam, allPlayers }) => {
  const [lineup, setLineup] = useState<LineupData | null>(null);
  const [starterIds, setStarterIds] = useState<(string | null)[]>(Array(STARTER_LABELS.length).fill(null));
  const [benchIds, setBenchIds] = useState<(string | null)[]>(Array(BENCH_SIZE).fill(null));
  const [draft, setDraft] = useState<DraftMinutes>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [openSwapSlot, setOpenSwapSlot] = useState<SlotId | null>(null);

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    allPlayers.forEach((p) => m.set(p.id, p));
    return m;
  }, [allPlayers]);

  const applyLineup = useCallback((data: LineupData) => {
    setLineup(data);
    setDraft({ ...data.minutesTargets });

    const nextStarters: (string | null)[] = Array(STARTER_LABELS.length).fill(null);
    data.starters.slice(0, STARTER_LABELS.length).forEach((id, idx) => {
      nextStarters[idx] = id;
    });
    setStarterIds(nextStarters);

    const nextBench: (string | null)[] = Array(BENCH_SIZE).fill(null);
    data.rotation.slice(0, BENCH_SIZE).forEach((id, idx) => {
      nextBench[idx] = id;
    });
    setBenchIds(nextBench);
  }, []);

  const fetchLineup = useCallback(async () => {
    if (!userTeam) return;
    setLoading(true);
    setError(null);
    setSaveOk(false);
    try {
      const data = await leagueAPI.getLineup(savedGameId, userTeam.id);
      applyLineup(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load lineup');
    } finally {
      setLoading(false);
    }
  }, [savedGameId, userTeam, applyLineup]);

  useEffect(() => {
    fetchLineup();
  }, [fetchLineup]);

  const handleMinuteChange = useCallback((playerId: string, value: number) => {
    setDraft((prev) => ({ ...prev, [playerId]: value }));
    setSaveOk(false);
  }, []);

  // Parse a slot id like "starter-2" or "bench-4"
  const parseSlot = (slot: SlotId): { group: 'starter' | 'bench'; idx: number } => {
    const [group, idxStr] = slot.split('-');
    return { group: group as 'starter' | 'bench', idx: parseInt(idxStr, 10) };
  };

  const getSlotPlayerId = useCallback(
    (slot: SlotId): string | null => {
      const { group, idx } = parseSlot(slot);
      return group === 'starter' ? starterIds[idx] : benchIds[idx];
    },
    [starterIds, benchIds]
  );

  const setSlotPlayerId = (arrs: { starters: (string | null)[]; bench: (string | null)[] }, slot: SlotId, value: string | null) => {
    const { group, idx } = parseSlot(slot);
    if (group === 'starter') {
      arrs.starters[idx] = value;
    } else {
      arrs.bench[idx] = value;
    }
  };

  const handleSwap = useCallback(
    (fromSlot: SlotId, toSlot: SlotId) => {
      setStarterIds((prevStarters) => {
        setBenchIds((prevBench) => {
          const arrs = { starters: [...prevStarters], bench: [...prevBench] };
          const fromVal = getSlotPlayerId(fromSlot);
          const toVal = getSlotPlayerId(toSlot);
          setSlotPlayerId(arrs, fromSlot, toVal);
          setSlotPlayerId(arrs, toSlot, fromVal);
          // schedule bench update via closure return below; starters handled outside
          setTimeout(() => setBenchIds(arrs.bench), 0);
          return arrs.bench;
        });
        const arrsPreview = { starters: [...prevStarters], bench: [...benchIds] };
        const fromVal = getSlotPlayerId(fromSlot);
        const toVal = getSlotPlayerId(toSlot);
        setSlotPlayerId(arrsPreview, fromSlot, toVal);
        setSlotPlayerId(arrsPreview, toSlot, fromVal);
        return arrsPreview.starters;
      });
      setOpenSwapSlot(null);
      setSaveOk(false);
    },
    [getSlotPlayerId, benchIds]
  );

  const isDirty = useMemo(() => {
    if (!lineup) return false;
    const minutesChanged = Object.keys(draft).some((id) => draft[id] !== (lineup.minutesTargets[id] ?? 0));
    const startersChanged = starterIds.some((id, idx) => id !== (lineup.starters[idx] ?? null));
    const benchChanged = benchIds.some((id, idx) => id !== (lineup.rotation[idx] ?? null));
    return minutesChanged || startersChanged || benchChanged;
  }, [draft, lineup, starterIds, benchIds]);

  const allSlotIds = useMemo(() => [...starterIds, ...benchIds], [starterIds, benchIds]);
  const total = useMemo(() => totalDraft(draft, allSlotIds), [draft, allSlotIds]);
  const budgetOk = Math.abs(total - TOTAL_MINUTES) <= 5;

  const diff = total - TOTAL_MINUTES;

  const handleSave = async () => {
    if (!userTeam || !lineup) return;
    setSaving(true);
    setError(null);
    try {
      const cleanStarters = starterIds.filter((id): id is string => !!id);
      const cleanBench = benchIds.filter((id): id is string => !!id);
      const data = await leagueAPI.setLineup(savedGameId, userTeam.id, {
        starters: cleanStarters,
        rotation: cleanBench,
        minutesTargets: draft,
      });
      applyLineup(data);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save lineup');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!userTeam) return;
    setResetting(true);
    setError(null);
    setSaveOk(false);
    try {
      const data = await leagueAPI.resetLineup(savedGameId, userTeam.id);
      applyLineup(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to reset lineup');
    } finally {
      setResetting(false);
    }
  };

  // Build eligible-swap list for a given slot: every other occupied/empty slot on the roster
  const buildEligible = useCallback(
    (slot: SlotId) => {
      const results: { slot: SlotId; label: string; player: Player }[] = [];
      starterIds.forEach((id, idx) => {
        const s: SlotId = `starter-${idx}`;
        if (s === slot || !id) return;
        const p = playerMap.get(id);
        if (p) results.push({ slot: s, label: STARTER_LABELS[idx], player: p });
      });
      benchIds.forEach((id, idx) => {
        const s: SlotId = `bench-${idx}`;
        if (s === slot || !id) return;
        const p = playerMap.get(id);
        if (p) results.push({ slot: s, label: `B${idx + 1}`, player: p });
      });
      return results;
    },
    [starterIds, benchIds, playerMap]
  );

  if (!userTeam) {
    return (
      <div className="glass-panel animated-border-glow error-panel-centered">
        <AlertCircle className="text-danger" size={32} />
        <h3 className="panel-title" style={{ marginTop: '16px' }}>No Managed Team</h3>
        <p className="panel-subtitle">Initialize the league strategy desk first to look up allocations.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="lineup-loading-container">
        <div className="pulse-ring-loader"></div>
        <p className="lineup-loading-text">Assembling depth matrices...</p>
      </div>
    );
  }

  return (
    <div className="glass-panel animated-border-glow lineup-dashboard-panel">
      <div className="panel-inner">
        {/* Header Block */}
        <div className="lineup-header-flex">
          <div className="lineup-header-titles">
            <span className="panel-badge neon-blue-badge">ROTATION DESK</span>
          </div>

          {/* Minutes Target Gauge widget */}
          <div className="minutes-gauge-card" style={{ borderColor: budgetColour(total) }}>
            <span className="meta-label text-right">Allocated Minutes</span>
            <div className="gauge-value-row">
              <span className="gauge-total" style={{ color: budgetColour(total) }}>{total}</span>
              <span className="gauge-max">/ {TOTAL_MINUTES}</span>
            </div>
            <div className="gauge-track">
              <div
                className="gauge-track-fill"
                style={{
                  width: `${Math.min(100, (total / TOTAL_MINUTES) * 100)}%`,
                  backgroundColor: budgetColour(total),
                }}
              />
            </div>
            {/* --- New delta indicator --- */}
            <div className="minutes-delta" style={{ color: budgetColour(total) }}>
              {diff === 0
                ? '✓ Balanced'
                : diff > 0
                  ? `${diff} min over`
                  : `${Math.abs(diff)} min needed`}
            </div>
          </div>
        </div>

        {/* Dynamic Alerts Banner */}
        {error && (
          <div className="glass-banner lineup-status-banner banner-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {saveOk && (
          <div className="glass-banner lineup-status-banner banner-success">
            <CheckCircle2 size={16} />
            <span>Tactical configurations deployed successfully.</span>
          </div>
        )}

        {/* Vertical Stack Roster Layout */}
        <div className="roster-vertical-layout">
          {/* Top Panel Section: Starters */}
          <div className="roster-section">
            <div className="section-title-wrapper">
              <span className="section-dot section-dot--starter" />
              <h3>Starting Lineup</h3>
              <span className="section-count">{starterIds.filter(Boolean).length}/{STARTER_LABELS.length}</span>
            </div>
            <div className="player-rows-stack">
              {STARTER_LABELS.map((label, idx) => {
                const slotId: SlotId = `starter-${idx}`;
                const playerId = starterIds[idx];
                const player = playerId ? playerMap.get(playerId) ?? null : null;
                return player ? (
                  <PlayerRow
                    key={slotId}
                    slotId={slotId}
                    player={player}
                    slotLabel={label}
                    isStarter={true}
                    minutes={draft[player.id] ?? 0}
                    onChangeMinutes={handleMinuteChange}
                    swapMenuOpen={openSwapSlot === slotId}
                    onToggleSwapMenu={setOpenSwapSlot}
                    eligibleForSwap={buildEligible(slotId)}
                    onSwap={handleSwap}
                  />
                ) : (
                  <EmptySlot
                    key={slotId}
                    slotId={slotId}
                    slotLabel={label}
                    swapMenuOpen={openSwapSlot === slotId}
                    onToggleSwapMenu={setOpenSwapSlot}
                    eligibleForSwap={buildEligible(slotId)}
                    onSwap={handleSwap}
                  />
                );
              })}
            </div>
          </div>

          {/* Bottom Panel Section: Bench Rotation */}
          <div className="roster-section">
            <div className="section-title-wrapper">
              <Users size={14} style={{ color: '#93c5fd' }} />
              <h3>Active Bench Rotations</h3>
              <span className="section-count">{benchIds.filter(Boolean).length}/{BENCH_SIZE}</span>
            </div>
            <div className="player-rows-stack">
              {benchIds.map((playerId, idx) => {
                const slotId: SlotId = `bench-${idx}`;
                const player = playerId ? playerMap.get(playerId) ?? null : null;
                return player ? (
                  <PlayerRow
                    key={slotId}
                    slotId={slotId}
                    player={player}
                    slotLabel={`B${idx + 1}`}
                    isStarter={false}
                    minutes={draft[player.id] ?? 0}
                    onChangeMinutes={handleMinuteChange}
                    swapMenuOpen={openSwapSlot === slotId}
                    onToggleSwapMenu={setOpenSwapSlot}
                    eligibleForSwap={buildEligible(slotId)}
                    onSwap={handleSwap}
                  />
                ) : (
                  <EmptySlot
                    key={slotId}
                    slotId={slotId}
                    slotLabel={`B${idx + 1}`}
                    swapMenuOpen={openSwapSlot === slotId}
                    onToggleSwapMenu={setOpenSwapSlot}
                    eligibleForSwap={buildEligible(slotId)}
                    onSwap={handleSwap}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Strategy Control Grid */}
        <div className="panel-actions-grid lineup-actions-footer">
          <button
            className="glass-btn btn-primary-blue-glow"
            onClick={handleSave}
            disabled={saving || resetting || !isDirty || !budgetOk}
            style={{ opacity: !isDirty || !budgetOk ? 0.4 : 1, cursor: !isDirty || !budgetOk ? 'not-allowed' : 'pointer' }}
          >
            <Save size={18} />
            {saving ? 'Deploying Changes...' : 'Save Configuration'}
          </button>

          <button
            className="glass-btn btn-secondary-danger"
            onClick={handleReset}
            disabled={saving || resetting}
          >
            <RefreshCw size={18} className={resetting ? 'spin-animation' : ''} />
            Reset Defaults
          </button>
        </div>

        {/* Informational Sub-footer */}
        <div className="panel-meta-footer">
          <div className="meta-item">
            <span className="meta-label">Allocation Rules</span>
            <span className="meta-value text-white">Target value must be strictly within ±5 mins of total.</span>
          </div>
          <div className="meta-item text-right">
            <span className="meta-label">Roster Status</span>
            <span className="meta-value text-white">
              {!budgetOk ? '⚠️ Balance requirement unfulfilled' : isDirty ? '⚙️ Unsaved strategies pending' : '✓ Synchronized'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LineupTab;