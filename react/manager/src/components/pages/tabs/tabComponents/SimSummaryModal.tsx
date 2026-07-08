import React from 'react';
import { SimSummary } from '../../../../api/leagueApi';

interface SimSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: SimSummary | null;
  gamesSimulated: number;
  gamesRemaining: number;
}

const SimSummaryModal: React.FC<SimSummaryModalProps> = ({
  isOpen,
  onClose,
  summary,
  gamesSimulated,
  gamesRemaining,
}) => {
  if (!isOpen || !summary) return null;

  const { userTeamImpact, standingsSnapshot, topPerformers, playerProgression } = summary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 text-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700 m-4">
        
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-6 flex justify-between items-center z-10">
          <div>
            <h2 className="text-2xl font-bold text-blue-400">Simulation Complete</h2>
            <p className="text-sm text-gray-400 mt-1">
              {summary.summary.datesCovered.from === summary.summary.datesCovered.to 
                ? `Date: ${summary.summary.datesCovered.from}`
                : `${summary.summary.datesCovered.from} → ${summary.summary.datesCovered.to}`
              }
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl leading-none font-bold"
          >
            &times;
          </button>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Top Row: Quick Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-3xl font-bold text-white">{gamesSimulated}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Games Simmed</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-3xl font-bold text-blue-400">{userTeamImpact.thisSim.record}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Your Record (This Sim)</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-3xl font-bold text-yellow-400">{gamesRemaining}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mt-1">Games Remaining</div>
            </div>
          </div>

          {/* User Team Season Impact */}
          {userTeamImpact.seasonTotal && (
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
                Season Totals
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-4xl font-bold">
                  {userTeamImpact.seasonTotal.record}
                </span>
                <div className="text-right text-sm text-gray-400">
                  <div>PF: <span className="text-white font-medium">{userTeamImpact.seasonTotal.pointsFor}</span></div>
                  <div>PA: <span className="text-white font-medium">{userTeamImpact.seasonTotal.pointsAgainst}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Top Performers */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              🌟 Top Performers
            </h3>
            <div className="space-y-2">
              {topPerformers.slice(0, 5).map((player, idx) => (
                <div 
                  key={player.playerId} 
                  className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-500 w-6">{idx + 1}</span>
                    <div>
                      <div className="font-semibold">{player.playerName}</div>
                      <div className="text-xs text-gray-400">{player.teamAbbreviation}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div className="text-center">
                      <div className="font-bold text-white">{player.points}</div>
                      <div className="text-[10px] text-gray-500">PTS</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-white">{player.rebounds}</div>
                      <div className="text-[10px] text-gray-500">REB</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-white">{player.assists}</div>
                      <div className="text-[10px] text-gray-500">AST</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Standings Snapshot */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
              🏆 Top 5 Standings
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-700">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Team</th>
                  <th className="pb-2 font-medium text-center">W</th>
                  <th className="pb-2 font-medium text-center">L</th>
                </tr>
              </thead>
              <tbody>
                {standingsSnapshot.map((team, idx) => (
                  <tr key={team.teamId} className="border-b border-gray-800">
                    <td className="py-2 text-gray-500">{idx + 1}</td>
                    <td className="py-2 font-medium">{team.abbreviation}</td>
                    <td className="py-2 text-center text-green-400">{team.wins}</td>
                    <td className="py-2 text-center text-red-400">{team.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Player Progression */}
          {playerProgression.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
                📈 Your Team Progression
              </h3>
              <div className="space-y-2">
                {playerProgression.map((prog) => (
                  <div key={prog.playerId} className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3">
                    <span className="font-medium">{prog.playerName}</span>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400">{prog.overallBefore}</span>
                      <span className={`font-bold ${prog.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {prog.delta > 0 ? '▲' : '▼'} {Math.abs(prog.delta)}
                      </span>
                      <span className="font-bold">{prog.overallAfter}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="sticky bottom-0 bg-gray-900 border-t border-gray-700 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-lg transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default SimSummaryModal;