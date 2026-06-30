// src/components/pages/tabs/FreeAgentTab.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, X, Search, RefreshCw } from 'lucide-react';
import { leagueAPI } from '../../../api/leagueApi';
import { Player, Team } from '../../../shared';
import './styles/FreeAgentTab.css';

interface FreeAgentsTabProps {
  savedGameId: string;
  teams: Team[];
}

const POSITIONS = ['All', 'PG', 'SG', 'SF', 'PF', 'C'];

const ratingClass = (r: number) =>
  r >= 80 ? 'rating-elite' : r >= 70 ? 'rating-good' : r >= 60 ? 'rating-average' : 'rating-low';

// Key traits to display per position
const POS_TRAITS: Record<string, [string, string][]> = {
  PG: [['Ball Handling', 'ball_handling'], ['Passing', 'passing'],      ['3PT', 'three_point']],
  SG: [['3PT',  'three_point'],            ['Mid Range', 'mid_range'],  ['Perim D', 'perimeter_defense']],
  SF: [['3PT',  'three_point'],            ['Inside',  'inside_scoring'],['Perim D', 'perimeter_defense']],
  PF: [['Inside', 'inside_scoring'],       ['Rebounding', 'rebounding'], ['Post D', 'post_defense']],
  C:  [['Inside', 'inside_scoring'],       ['Rebounding', 'rebounding'], ['Post D', 'post_defense']],
};

type Feedback = { type: 'success' | 'error'; message: string } | null;

const FreeAgentsTab: React.FC<FreeAgentsTabProps> = ({ savedGameId, teams }) => {
  const [players,       setPlayers]       = useState<Player[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [posFilter,     setPosFilter]     = useState('All');
  const [minOverall,    setMinOverall]     = useState('');
  const [signingPlayer, setSigningPlayer] = useState<Player | null>(null);
  const [teamId,        setTeamId]        = useState('');
  const [actionBusy,    setActionBusy]    = useState(false);
  const [feedback,      setFeedback]      = useState<Feedback>(null);
  const [releaseBusy,   setReleaseBusy]   = useState<string | null>(null); // playerId

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const data = await leagueAPI.getFreeAgents(savedGameId, {
        position:   posFilter === 'All' ? undefined : posFilter,
        minOverall: minOverall ? parseInt(minOverall, 10) : undefined,
        limit:      150,
      });
      setPlayers(data);
    } catch {
      setFeedback({ type: 'error', message: 'Failed to load free agents.' });
    } finally {
      setLoading(false);
    }
  }, [savedGameId, posFilter, minOverall]);

  useEffect(() => { load(); }, [load]);

  // Auto-dismiss feedback after 4 s
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  // ── Sign flow ─────────────────────────────────────────────────────────────

  const openSign = (player: Player) => {
    setSigningPlayer(player);
    setTeamId('');
  };

  const confirmSign = async () => {
    if (!signingPlayer || !teamId) return;
    setActionBusy(true);
    try {
      await leagueAPI.signFreeAgent(savedGameId, { playerId: signingPlayer.id, teamId });
      const name = `${signingPlayer.first_name} ${signingPlayer.last_name}`;
      const dest = teams.find(t => t.id === teamId)?.name ?? 'team';
      setFeedback({ type: 'success', message: `${name} signed to ${dest}.` });
      setSigningPlayer(null);
      await load();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.response?.data?.error ?? 'Failed to sign player.' });
    } finally {
      setActionBusy(false);
    }
  };

  // ── Release flow ──────────────────────────────────────────────────────────

  const handleRelease = async (player: Player) => {
    if (!window.confirm(`Release ${player.first_name} ${player.last_name} to free agency?`)) return;
    setReleaseBusy(player.id);
    try {
      await leagueAPI.releasePlayer(savedGameId, player.id);
      setFeedback({
        type: 'success',
        message: `${player.first_name} ${player.last_name} released.`,
      });
      await load();
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.response?.data?.error ?? 'Failed to release player.' });
    } finally {
      setReleaseBusy(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fa-panel">

      {/* Header */}
      <div className="fa-header">
        <div className="fa-title-row">
          <UserPlus size={20} strokeWidth={2} />
          <h3>Free Agents</h3>
          <span className="fa-count">{players.length}</span>
        </div>

        <div className="fa-controls">
          {/* Position filter */}
          <div className="fa-pos-filters">
            {POSITIONS.map(p => (
              <button
                key={p}
                className={`fa-pos-btn ${posFilter === p ? 'active' : ''}`}
                onClick={() => setPosFilter(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Min overall filter */}
          <div className="fa-ovr-filter">
            <Search size={14} />
            <input
              type="number"
              placeholder="Min OVR"
              min={40}
              max={99}
              value={minOverall}
              onChange={e => setMinOverall(e.target.value)}
            />
          </div>

          <button className="fa-refresh-btn" onClick={load} disabled={loading} title="Refresh">
            <RefreshCw size={15} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`fa-feedback fa-feedback--${feedback.type}`}>
          {feedback.message}
          <button onClick={() => setFeedback(null)}><X size={14} /></button>
        </div>
      )}

      {/* Player table */}
      <div className="fa-table-wrap">
        {loading ? (
          <div className="fa-empty">Loading free agents…</div>
        ) : players.length === 0 ? (
          <div className="fa-empty">No free agents match your filters.</div>
        ) : (
          <table className="fa-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th>Age</th>
                <th>OVR</th>
                <th>Trait 1</th>
                <th>Trait 2</th>
                <th>Trait 3</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => {
                const traits = POS_TRAITS[player.position] ?? POS_TRAITS['SF'];
                return (
                  <tr key={player.id} className="fa-row">
                    <td className="fa-name">
                      {player.first_name} {player.last_name}
                    </td>
                    <td>
                      <span className="fa-pos-badge">{player.position}</span>
                    </td>
                    <td className="fa-muted">{player.age}</td>
                    <td>
                      <span className={`fa-rating ${ratingClass(player.overall_rating)}`}>
                        {player.overall_rating}
                      </span>
                    </td>
                    {traits.map(([label, key]) => (
                      <td key={key} className="fa-trait">
                        <span className="fa-trait-label">{label}</span>
                        <span className="fa-trait-val">
                          {(player.traits as any)?.[key] ?? '—'}
                        </span>
                      </td>
                    ))}
                    <td className="fa-actions">
                      <button
                        className="fa-sign-btn"
                        onClick={() => openSign(player)}
                        title="Sign player"
                      >
                        Sign
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Sign modal */}
      {signingPlayer && (
        <div className="fa-modal-backdrop" onClick={() => setSigningPlayer(null)}>
          <div className="fa-modal" onClick={e => e.stopPropagation()}>
            <div className="fa-modal-header">
              <h4>Sign {signingPlayer.first_name} {signingPlayer.last_name}</h4>
              <button onClick={() => setSigningPlayer(null)}><X size={18} /></button>
            </div>

            <div className="fa-modal-info">
              <span className="fa-pos-badge">{signingPlayer.position}</span>
              <span className={`fa-rating ${ratingClass(signingPlayer.overall_rating)}`}>
                OVR {signingPlayer.overall_rating}
              </span>
              <span className="fa-muted">Age {signingPlayer.age}</span>
            </div>

            <label className="fa-modal-label">Choose a team</label>
            <select
              className="fa-team-select"
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
            >
              <option value="">— Select team —</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.city} {t.name}</option>
              ))}
            </select>

            <div className="fa-modal-actions">
              <button
                className="fa-cancel-btn"
                onClick={() => setSigningPlayer(null)}
                disabled={actionBusy}
              >
                Cancel
              </button>
              <button
                className="fa-confirm-btn"
                onClick={confirmSign}
                disabled={!teamId || actionBusy}
              >
                {actionBusy ? 'Signing…' : 'Confirm Sign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FreeAgentsTab;