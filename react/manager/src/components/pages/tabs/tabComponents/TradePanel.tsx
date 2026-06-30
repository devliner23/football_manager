import React, { useState, useEffect, useCallback } from 'react';
import { Player, Team } from '../../../../shared/index';
import './TradePanel.css';

interface TradePanelProps {
  savedGameId: string;
  userTeamId: string;
  teams: Team[]; // all teams EXCEPT the user’s team
}

const TradePanel: React.FC<TradePanelProps> = ({ savedGameId, userTeamId, teams }) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [userRoster, setUserRoster] = useState<Player[]>([]);
  const [otherRoster, setOtherRoster] = useState<Player[]>([]);
  const [loadingRosters, setLoadingRosters] = useState(false);
  const [tradeFromUser, setTradeFromUser] = useState<Player[]>([]);
  const [tradeFromOther, setTradeFromOther] = useState<Player[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Memoize fetchRoster so it can be safely used inside effects
  const fetchRoster = useCallback(
    async (teamId: string, setter: (data: Player[]) => void) => {
      setLoadingRosters(true);
      try {
        const res = await fetch(`/api/saved-games/${savedGameId}/teams/${teamId}/players`);
        if (!res.ok) throw new Error('Failed to fetch roster');
        const data = await res.json();
        // Adjust if your API wraps the array differently
        setter(data.players ?? data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoadingRosters(false);
      }
    },
    [savedGameId]
  );

  // Fetch user roster on mount
  useEffect(() => {
    fetchRoster(userTeamId, setUserRoster);
  }, [userTeamId, fetchRoster]);

  // Fetch opponent roster when selection changes
  useEffect(() => {
    if (!selectedTeamId) {
      setOtherRoster([]);
      return;
    }
    fetchRoster(selectedTeamId, setOtherRoster);
  }, [selectedTeamId, fetchRoster]);

  const togglePlayer = (player: Player, fromUser: boolean) => {
    if (fromUser) {
      setTradeFromUser(prev =>
        prev.find(p => p.id === player.id)
          ? prev.filter(p => p.id !== player.id)
          : [...prev, player]
      );
    } else {
      setTradeFromOther(prev =>
        prev.find(p => p.id === player.id)
          ? prev.filter(p => p.id !== player.id)
          : [...prev, player]
      );
    }
    setError('');
    setSuccess('');
  };

  const handleSubmit = async () => {
    if (!selectedTeamId) {
      setError('Please select an opponent team.');
      return;
    }
    if (tradeFromUser.length === 0 && tradeFromOther.length === 0) {
      setError('Add at least one player to the trade.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        receivingTeamId: selectedTeamId,
        playerIdsFromProposer: tradeFromUser.map(p => p.id),
        playerIdsFromReceiver: tradeFromOther.map(p => p.id),
      };

      const res = await fetch(`/api/saved-games/${savedGameId}/trades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Trade proposal failed');
      }

      const trade = await res.json();
      setSuccess(
        trade.status === 'completed'
          ? 'Trade accepted and completed! Rosters updated.'
          : `Trade proposed. Status: ${trade.status} – ${trade.result || ''}`
      );

      setTradeFromUser([]);
      setTradeFromOther([]);

      // Refresh rosters after a short delay
      const timer = setTimeout(() => {
        fetchRoster(userTeamId, setUserRoster);
        if (selectedTeamId) fetchRoster(selectedTeamId, setOtherRoster);
      }, 500);

      // Cleanup in case component unmounts before the timeout
      return () => clearTimeout(timer);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Small sub-component for player cards – uses CSS classes now
  const PlayerCard: React.FC<{
    player: Player;
    isSelected: boolean;
    onClick: () => void;
  }> = ({ player, isSelected, onClick }) => (
    <div
      className={`player-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <strong>{player.first_name} {player.last_name}</strong>
      <div className="player-position">{player.position} | OVR: {player.overall_rating}</div>
    </div>
  );

  return (
    <div className="trade-panel">
      {/* LEFT: User roster */}
      <div className="roster-panel">
        <h3>Your Team</h3>
        {loadingRosters && <p>Loading...</p>}
        {userRoster.map(player => (
          <PlayerCard
            key={player.id}
            player={player}
            isSelected={tradeFromUser.some(p => p.id === player.id)}
            onClick={() => togglePlayer(player, true)}
          />
        ))}
        <p className="helper-text">
          Click to select players you will <strong>give away</strong>.
        </p>
      </div>

      {/* CENTER: trade summary and actions */}
      <div className="trade-summary">
        <h3>Trade Summary</h3>

        <div className="team-select">
          <label>Opponent Team: </label>
          <select
            value={selectedTeamId}
            onChange={e => {
              setSelectedTeamId(e.target.value);
              setTradeFromOther([]);
              setError('');
              setSuccess('');
            }}
          >
            <option value="">-- Choose a team --</option>
            {teams.map(team => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.abbreviation})
              </option>
            ))}
          </select>
        </div>

        <div className="trade-lists">
          <h4>You give away:</h4>
          {tradeFromUser.length === 0 && <p style={{ color: '#94a3b8' }}>None</p>}
          {tradeFromUser.map(p => (
            <div key={p.id} className="player-name">
              {p.first_name} {p.last_name}
            </div>
          ))}
        </div>
        <div className="trade-arrow">⇄</div>
        <div className="trade-lists">
          <h4>You receive:</h4>
          {tradeFromOther.length === 0 && <p style={{ color: '#94a3b8' }}>None</p>}
          {tradeFromOther.map(p => (
            <div key={p.id} className="player-name">
              {p.first_name} {p.last_name}
            </div>
          ))}
        </div>

        <button
          className="submit-btn"
          onClick={handleSubmit}
          disabled={submitting || !selectedTeamId}
        >
          {submitting ? 'Submitting...' : 'Propose Trade'}
        </button>

        {error && <p className="feedback-message error">{error}</p>}
        {success && <p className="feedback-message success">{success}</p>}
      </div>

      {/* RIGHT: Opponent roster */}
      <div className="roster-panel">
        <h3>{selectedTeamId ? 'Opponent Roster' : 'Select a team'}</h3>
        {!selectedTeamId && <p style={{ color: '#94a3b8' }}>Pick an opponent from the dropdown above.</p>}
        {loadingRosters && selectedTeamId && <p>Loading...</p>}
        {otherRoster.map(player => (
          <PlayerCard
            key={player.id}
            player={player}
            isSelected={tradeFromOther.some(p => p.id === player.id)}
            onClick={() => togglePlayer(player, false)}
          />
        ))}
        {selectedTeamId && otherRoster.length > 0 && (
          <p className="helper-text">
            Click to select players you want to <strong>receive</strong>.
          </p>
        )}
      </div>
    </div>
  );
};

export default TradePanel;