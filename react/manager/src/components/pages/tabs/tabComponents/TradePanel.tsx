import React, { useState, useEffect } from 'react';
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

  // fetch user roster on mount
  useEffect(() => {
    fetchRoster(userTeamId, setUserRoster);
  }, [userTeamId]);

  // fetch opponent roster when selection changes
  useEffect(() => {
    if (!selectedTeamId) {
      setOtherRoster([]);
      return;
    }
    fetchRoster(selectedTeamId, setOtherRoster);
  }, [selectedTeamId]);

  const fetchRoster = async (teamId: string, setter: (data: Player[]) => void) => {
    setLoadingRosters(true);
    try {
      const res = await fetch(`/api/saved-games/${savedGameId}/teams/${teamId}/players`);
      if (!res.ok) throw new Error('Failed to fetch roster');
      const data = await res.json();
      // adjust if your API wraps the array differently
      setter(data.players ?? data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingRosters(false);
    }
  };

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
      // refresh rosters after a short delay
      setTimeout(() => {
        fetchRoster(userTeamId, setUserRoster);
        if (selectedTeamId) fetchRoster(selectedTeamId, setOtherRoster);
      }, 500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const PlayerCard: React.FC<{ player: Player; isSelected: boolean; onClick: () => void }> = ({
    player,
    isSelected,
    onClick,
  }) => (
    <div
      className={`player-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      style={{
        border: '1px solid #ccc',
        padding: '8px',
        margin: '4px 0',
        cursor: 'pointer',
        backgroundColor: isSelected ? '#e0f0ff' : '#fff',
        borderRadius: '4px',
      }}
    >
      <strong>{player.first_name} {player.last_name}</strong>
      <div>{player.position} | OVR: {player.overall_rating}</div>
    </div>
  );

  return (
    <div className="trade-panel" style={{ display: 'flex', gap: '20px', padding: '20px' }}>
      {/* LEFT: User roster */}
      <div style={{ flex: 1 }}>
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
        <p style={{ marginTop: '10px', fontStyle: 'italic' }}>
          Click to select players you will <strong>give away</strong>.
        </p>
      </div>

      {/* CENTER: summary and actions */}
      <div style={{ flex: 0.8, textAlign: 'center' }}>
        <h3>Trade Summary</h3>

        <div style={{ marginBottom: '10px' }}>
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

        <div>
          <h4>You give away:</h4>
          {tradeFromUser.length === 0 && <p style={{ color: '#888' }}>None</p>}
          {tradeFromUser.map(p => <div key={p.id}>{p.first_name} {p.last_name}</div>)}
        </div>
        <div style={{ margin: '15px 0', fontSize: '24px' }}>⇄</div>
        <div>
          <h4>You receive:</h4>
          {tradeFromOther.length === 0 && <p style={{ color: '#888' }}>None</p>}
          {tradeFromOther.map(p => <div key={p.id}>{p.first_name} {p.last_name}</div>)}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || !selectedTeamId}
          style={{ marginTop: '20px', padding: '8px 16px' }}
        >
          {submitting ? 'Submitting...' : 'Propose Trade'}
        </button>

        {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
        {success && <p style={{ color: 'green', marginTop: '10px' }}>{success}</p>}
      </div>

      {/* RIGHT: Opponent roster */}
      <div style={{ flex: 1 }}>
        <h3>{selectedTeamId ? 'Opponent Roster' : 'Select a team'}</h3>
        {!selectedTeamId && <p style={{ color: '#888' }}>Pick an opponent from the dropdown above.</p>}
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
          <p style={{ marginTop: '10px', fontStyle: 'italic' }}>
            Click to select players you want to <strong>receive</strong>.
          </p>
        )}
      </div>
    </div>
  );
};

export default TradePanel;