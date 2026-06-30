// src/components/pages/tabs/LineupTab.tsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, Star, Users, Clock, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Player, Team } from '../../../shared/index';
import { leagueAPI, LineupData } from '../../../api/leagueApi';
import './styles/LineupTab.css';

// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_MINUTES = 240; // 48 min × 5 players
const STARTER_LABELS = ['PG', 'SG', 'SF', 'PF', 'C'];
// Softer, glass-friendly colours
const POSITION_COLOURS: Record<string, string> = {
  PG: '#7aa2f7', // soft blue
  SG: '#9d7cd8', // soft purple
  SF: '#6abf8d', // soft green
  PF: '#e0a84f', // soft gold
  C:  '#e06c75', // soft red
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineupTabProps {
  savedGameId: string;
  userTeam: Team | undefined;
  allPlayers: Player[];
}

type DraftMinutes = Record<string, number>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalDraft(draft: DraftMinutes): number {
  return Object.values(draft).reduce((a, b) => a + b, 0);
}

function budgetColour(total: number): string {
  const diff = Math.abs(total - TOTAL_MINUTES);
  if (diff === 0)  return '#a0c4ff'; // soft blue
  if (diff <= 5)   return '#f0c27f'; // soft gold
  return '#e06c75';                  // soft red
}

function ratingClass(r: number): string {
  if (r >= 85) return 'lineup-rating--elite';
  if (r >= 70) return 'lineup-rating--good';
  return 'lineup-rating--average';
}

// ── PlayerRow ─────────────────────────────────────────────────────────────────
// No slider – only the numeric input.

interface PlayerRowProps {
  player: Player;
  slotLabel: string;
  isStarter: boolean;
  minutes: number;
  onChange: (playerId: string, value: number) => void;
}

const PlayerRow: React.FC<PlayerRowProps> = ({ player, slotLabel, isStarter, minutes, onChange }) => {
  const colour = POSITION_COLOURS[player.position] ?? '#94a3b8';

  const handleNumber = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = parseInt(e.target.value, 10);
    if (Number.isNaN(raw)) return;
    onChange(player.id, Math.max(0, Math.min(48, raw)));
  };

  return (
    <div className={`lineup-player-card ${isStarter ? 'lineup-player-card--starter' : ''}`}>
      {/* Slot label */}
      <div className="lineup-slot-label" style={{ color: colour }}>
        {slotLabel}
      </div>

      {/* Position badge */}
      <div
        className="lineup-position-badge"
        style={{ background: colour + '20', color: colour, borderColor: colour + '55' }}
      >
        {player.position}
      </div>

      {/* Name + rating */}
      <div className="lineup-player-info">
        <span className="lineup-player-name">
          {player.first_name} {player.last_name}
        </span>
        <span className={`lineup-rating ${ratingClass(player.overall_rating)}`}>
          {player.overall_rating}
        </span>
      </div>

      {/* Numeric input only */}
      <div className="lineup-minutes-input-wrap">
        <input
          type="number"
          min={0}
          max={48}
          value={minutes}
          onChange={handleNumber}
          className="lineup-minutes-input"
        />
        <span className="lineup-minutes-unit">m</span>
      </div>
    </div>
  );
};

// ── EmptySlot ─────────────────────────────────────────────────────────────────

const EmptySlot: React.FC<{ slotLabel: string }> = ({ slotLabel }) => (
  <div className="lineup-player-card lineup-player-card--empty">
    <div className="lineup-slot-label lineup-slot-label--empty">{slotLabel}</div>
    <div className="lineup-empty-placeholder">
      <Users size={14} />
      <span>No player</span>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const LineupTab: React.FC<LineupTabProps> = ({ savedGameId, userTeam, allPlayers }) => {
  const [lineup,    setLineup]    = useState<LineupData | null>(null);
  const [draft,     setDraft]     = useState<DraftMinutes>({});
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [saveOk,    setSaveOk]    = useState(false);

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    allPlayers.forEach(p => m.set(p.id, p));
    return m;
  }, [allPlayers]);

  // ── Load ────────────────────────────────────────────────────────────────────
  const fetchLineup = useCallback(async () => {
    if (!userTeam) return;
    setLoading(true);
    setError(null);
    setSaveOk(false);
    try {
      const data = await leagueAPI.getLineup(savedGameId, userTeam.id);
      setLineup(data);
      setDraft({ ...data.minutesTargets });
    } catch (err: any) {
      setError(err.message ?? 'Failed to load lineup');
    } finally {
      setLoading(false);
    }
  }, [savedGameId, userTeam]);

  useEffect(() => { fetchLineup(); }, [fetchLineup]);

  // ── Draft helpers ───────────────────────────────────────────────────────────
  const handleMinuteChange = useCallback((playerId: string, value: number) => {
    setDraft(prev => ({ ...prev, [playerId]: value }));
    setSaveOk(false);
  }, []);

  const isDirty = useMemo(() => {
    if (!lineup) return false;
    return Object.keys(draft).some(
      id => draft[id] !== (lineup.minutesTargets[id] ?? 0)
    );
  }, [draft, lineup]);

  const total = useMemo(() => totalDraft(draft), [draft]);
  const budgetOk = Math.abs(total - TOTAL_MINUTES) <= 5;

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!userTeam || !lineup) return;
    setSaving(true);
    setError(null);
    try {
      const data = await leagueAPI.setLineup(savedGameId, userTeam.id, {
        starters:      lineup.starters,
        rotation:      lineup.rotation,
        minutesTargets: draft,
      });
      setLineup(data);
      setDraft({ ...data.minutesTargets });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save lineup');
    } finally {
      setSaving(false);
    }
  };

  // ── Reset ───────────────────────────────────────────────────────────────────
  const handleReset = async () => {
    if (!userTeam) return;
    setResetting(true);
    setError(null);
    setSaveOk(false);
    try {
      const data = await leagueAPI.resetLineup(savedGameId, userTeam.id);
      setLineup(data);
      setDraft({ ...data.minutesTargets });
    } catch (err: any) {
      setError(err.message ?? 'Failed to reset lineup');
    } finally {
      setResetting(false);
    }
  };

  // ── Derived player lists ────────────────────────────────────────────────────
  const starters = lineup ? lineup.starters.map(id => playerMap.get(id) ?? null) : [];
  const bench    = lineup ? lineup.rotation.map(id => playerMap.get(id) ?? null) : [];

  // ── No team guard ───────────────────────────────────────────────────────────
  if (!userTeam) {
    return (
      <div className="lineup-panel">
        <div className="lineup-empty-state">
          <Users size={40} strokeWidth={1.5} />
          <p>No managed team found. Initialize the league first.</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="lineup-panel">

      {/* ── Header ── */}
      <div className="lineup-header">
        <div className="lineup-header-left">
          <Star size={18} strokeWidth={2} className="lineup-header-icon" />
          <div>
            <h3 className="lineup-title">{userTeam.name} Lineup</h3>
            {lineup && (
              <span className={`lineup-mode-badge ${lineup.isAuto ? 'lineup-mode-badge--auto' : 'lineup-mode-badge--custom'}`}>
                {lineup.isAuto ? 'Auto-assigned' : 'Custom'}
              </span>
            )}
          </div>
        </div>

        <div className="lineup-header-actions">
          <button
            className="lineup-reset-btn"
            onClick={handleReset}
            disabled={resetting || loading || saving}
            title="Re-generate lineup from ratings"
          >
            <RefreshCw size={14} className={resetting ? 'lineup-spinning' : ''} />
            {resetting ? 'Resetting…' : 'Reset to Auto'}
          </button>

          <button
            className={`lineup-save-btn ${!isDirty || !budgetOk ? 'lineup-save-btn--disabled' : ''} ${saveOk ? 'lineup-save-btn--ok' : ''}`}
            onClick={handleSave}
            disabled={!isDirty || !budgetOk || saving || loading}
            title={!budgetOk ? `Minutes must total ${TOTAL_MINUTES} (currently ${total})` : 'Save lineup'}
          >
            {saveOk
              ? <><CheckCircle2 size={14} /> Saved</>
              : saving
                ? <><Save size={14} className="lineup-spinning" /> Saving…</>
                : <><Save size={14} /> Save</>
            }
          </button>
        </div>
      </div>

      {/* ── Budget bar ── */}
      {lineup && !loading && (
        <div className="lineup-budget">
          <div className="lineup-budget-labels">
            <span className="lineup-budget-title">
              <Clock size={13} /> Minutes budget
            </span>
            <span
              className="lineup-budget-total"
              style={{ color: budgetColour(total) }}
            >
              {total} / {TOTAL_MINUTES}
              {!budgetOk && (
                <span className="lineup-budget-warning">
                  <AlertCircle size={12} />
                  {total > TOTAL_MINUTES ? `${total - TOTAL_MINUTES} over` : `${TOTAL_MINUTES - total} remaining`}
                </span>
              )}
            </span>
          </div>
          <div className="lineup-budget-track">
            <div
              className="lineup-budget-fill"
              style={{
                width: `${Math.min(100, (total / TOTAL_MINUTES) * 100)}%`,
                background: budgetColour(total),
              }}
            />
          </div>
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div className="lineup-error">
          ⚠ {error}
          <button onClick={fetchLineup} className="lineup-error-retry">Retry</button>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="lineup-skeleton-wrap">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="lineup-skeleton-card" />
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {!loading && lineup && (
        <>
          {/* Starting five */}
          <section className="lineup-section">
            <div className="lineup-section-header">
              <span className="lineup-section-label">Starting Five</span>
              <span className="lineup-section-count">
                {starters.filter(Boolean).length} / 5
              </span>
            </div>
            <div className="lineup-cards">
              {[0, 1, 2, 3, 4].map(i => {
                const player = starters[i] ?? null;
                const label  = STARTER_LABELS[i] ?? String(i + 1);
                return player
                  ? <PlayerRow
                      key={player.id}
                      player={player}
                      slotLabel={label}
                      isStarter
                      minutes={draft[player.id] ?? 0}
                      onChange={handleMinuteChange}
                    />
                  : <EmptySlot key={i} slotLabel={label} />;
              })}
            </div>
          </section>

          {/* Bench */}
          {bench.length > 0 && (
            <section className="lineup-section">
              <div className="lineup-section-header">
                <span className="lineup-section-label">Bench</span>
                <span className="lineup-section-count">{bench.filter(Boolean).length} players</span>
              </div>
              <div className="lineup-cards">
                {bench.map((player, i) =>
                  player
                    ? <PlayerRow
                        key={player.id}
                        player={player}
                        slotLabel={String(i + 6)}
                        isStarter={false}
                        minutes={draft[player.id] ?? 0}
                        onChange={handleMinuteChange}
                      />
                    : <EmptySlot key={i} slotLabel={String(i + 6)} />
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default LineupTab;