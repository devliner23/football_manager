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
  C: '#e06c75',  // soft red
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
  if (diff === 0) return '#10b981'; // Green accent matching status indicators
  if (diff <= 5) return '#f58e0b';  // Amber accent
  return '#ef4444';                 // Danger red
}

function ratingClass(r: number): string {
  if (r >= 85) return 'lineup-rating--elite';
  if (r >= 70) return 'lineup-rating--good';
  return 'lineup-rating--average';
}

// ── PlayerRow ─────────────────────────────────────────────────────────────────
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
      <div className="lineup-player-identity">
        <div className="lineup-slot-label" style={{ backgroundColor: `${colour}20`, color: colour }}>
          {slotLabel}
        </div>
        <div className="lineup-player-meta">
          <span className="lineup-player-name">{player.full_name}</span>
          <span className="lineup-player-pos-tag">{player.position}</span>
        </div>
      </div>

      <div className="lineup-player-stats">
        <div className={`lineup-rating-badge ${ratingClass(player.overall_rating)}`}>
          OVR {player.overall_rating}
        </div>
        <div className="lineup-minutes-input-wrapper">
          <Clock size={14} className="input-clock-icon" />
          <input
            type="number"
            className="lineup-minutes-input"
            value={minutes}
            onChange={handleNumber}
            min={0}
            max={48}
          />
          <span className="input-unit-label">m</span>
        </div>
      </div>
    </div>
  );
};

// ── EmptySlot ─────────────────────────────────────────────────────────────────
const EmptySlot: React.FC<{ slotLabel: string }> = ({ slotLabel }) => (
  <div className="lineup-player-card lineup-player-card--empty">
    <div className="lineup-player-identity">
      <div className="lineup-slot-label empty-label">{slotLabel}</div>
      <span className="lineup-player-name empty-text">Unassigned Roster Position</span>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────
const LineupTab: React.FC<LineupTabProps> = ({ savedGameId, userTeam, allPlayers }) => {
  const [lineup, setLineup] = useState<LineupData | null>(null);
  const [draft, setDraft] = useState<DraftMinutes>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    allPlayers.forEach(p => m.set(p.id, p));
    return m;
  }, [allPlayers]);

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
        setLoading(false)
    }
  }, [savedGameId, userTeam]);

  useEffect(() => {
    fetchLineup();
  }, [fetchLineup]);

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

  const handleSave = async () => {
    if (!userTeam || !lineup) return;
    setSaving(true);
    setError(null);
    try {
      const data = await leagueAPI.setLineup(savedGameId, userTeam.id, {
        starters: lineup.starters,
        rotation: lineup.rotation,
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

  const starters = lineup ? lineup.starters.map(id => playerMap.get(id) ?? null) : [];
  const bench = lineup ? lineup.rotation.map(id => playerMap.get(id) ?? null) : [];

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
          {/* Minutes Target Gauge widget */}
          <div className="minutes-gauge-card" style={{ borderColor: budgetColour(total) }}>
            <span className="meta-label text-right">Allocated Minutes</span>
            <div className="gauge-value-row">
              <span className="gauge-total" style={{ color: budgetColour(total) }}>{total}</span>
              <span className="gauge-max">/ {TOTAL_MINUTES}</span>
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
              <Star size={16} className="text-glow-blue" />
              <h3>Starting Lineup</h3>
            </div>
            <div className="player-rows-stack">
              {STARTER_LABELS.map((label, idx) => {
                const player = starters[idx];
                return player ? (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    slotLabel={label}
                    isStarter={true}
                    minutes={draft[player.id] ?? 0}
                    onChange={handleMinuteChange}
                  />
                ) : (
                  <EmptySlot key={`starter-empty-${idx}`} slotLabel={label} />
                );
              })}
            </div>
          </div>

          {/* Bottom Panel Section: Bench Rotation */}
          <div className="roster-section">
            <div className="section-title-wrapper">
              <Users size={16} style={{ color: '#93c5fd' }} />
              <h3>Active Bench Rotations</h3>
            </div>
            <div className="player-rows-stack">
              {bench.length === 0 ? (
                <div className="lineup-player-card lineup-player-card--empty">
                  <span className="empty-text">No depth players added to active bench lineup rotation rulesets.</span>
                </div>
              ) : (
                bench.map((player, idx) =>
                  player ? (
                    <PlayerRow
                      key={player.id}
                      player={player}
                      slotLabel={`B${idx + 1}`}
                      isStarter={false}
                      minutes={draft[player.id] ?? 0}
                      onChange={handleMinuteChange}
                    />
                  ) : (
                    <EmptySlot key={`bench-empty-${idx}`} slotLabel={`B${idx + 1}`} />
                  )
                )
              )}
            </div>
          </div>
        </div>

        {/* Strategy Control Grid */}
        <div className="panel-actions-grid lineup-actions-footer">
          <button
            className="glass-btn btn-primary-blue-glow"
            onClick={handleSave}
            disabled={saving || resetting || !isDirty || !budgetOk}
            style={{ opacity: (!isDirty || !budgetOk) ? 0.4 : 1, cursor: (!isDirty || !budgetOk) ? 'not-allowed' : 'pointer' }}
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