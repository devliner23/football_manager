// services/financeService.js
const { supabaseAdmin } = require('../config/supabase');

class FinanceService {
  /* 
  * Initializes financial contracts and payrolls for a newly created league.
   * Static method – call it directly on the class: FinanceService.initializeLeagueFinances(...)
   * @param {string} savedGameId
   * @param {Array} teams
   * @param {Array} players
   */
  static async initializeLeagueFinances(savedGameId, teams, players) {
    try {
      const BASE_MIN_SALARY = 1100000;
      const contractsToInsert = [];

      const teamPayrollMap = {};
      teams.forEach(team => {
        teamPayrollMap[team.id] = 0;
      });

      for (const player of players) {
        if (!player.team_id) continue;

        const overall = player.overall_rating;
        let baseSalary = BASE_MIN_SALARY;
        let maxYears = 2;

        if (overall >= 90) {
          baseSalary = 35000000 + (overall - 90) * 1250000;
          maxYears = 5;
        } else if (overall >= 80) {
          baseSalary = 18000000 + (overall - 80) * 1200000;
          maxYears = 4;
        } else if (overall >= 70) {
          baseSalary = 5000000 + (overall - 70) * 1000000;
          maxYears = 3;
        } else {
          baseSalary = BASE_MIN_SALARY + (overall - 60) * 300000;
          maxYears = 2;
        }

        const variance = (Math.random() * 0.1) - 0.05;
        const finalizedSalary = Math.round(baseSalary * (1 + variance));

        let years = Math.floor(Math.random() * maxYears) + 1;
        if (player.age > 33 && years > 2) years = 2;

        contractsToInsert.push({
          saved_game_id: savedGameId,
          player_id: player.id,
          team_id: player.team_id,
          salary: finalizedSalary,
          years_remaining: years,
          total_years: years
        });

        if (teamPayrollMap[player.team_id] !== undefined) {
          teamPayrollMap[player.team_id] += finalizedSalary;
        }
      }

      if (contractsToInsert.length > 0) {
        const { error: contractErr } = await supabaseAdmin
          .from('contracts')
          .insert(contractsToInsert);

        if (contractErr) throw contractErr;
      }

      const STANDARD_CAP = 140500000;
      const teamUpdates = Object.keys(teamPayrollMap).map(async (teamId) => {
        const payroll = teamPayrollMap[teamId];
        const capSpace = STANDARD_CAP - payroll;

        return supabaseAdmin
          .from('teams')
          .update({
            total_payroll: payroll,
            salary_cap_space: capSpace
          })
          .eq('id', teamId);
      });

      await Promise.all(teamUpdates);

      return { success: true, message: 'League finances successfully initialized.' };
    } catch (error) {
      console.error('Error initializing league finances:', error);
      throw error;
    }
  }

  /**
   * Get financial summaries for all teams.
   * Returns array of objects with payroll, cap space, top earner, etc.
   */
  static async getAllTeamFinances(savedGameId) {
    // 1. Fetch all teams for this saved game
    const { data: teams, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, city, abbreviation, total_payroll, salary_cap_space')
      .eq('saved_game_id', savedGameId);

    if (teamErr) throw new Error(`Failed to fetch teams: ${teamErr.message}`);
    if (!teams || teams.length === 0) return [];

    const teamIds = teams.map(t => t.id);

    // 2. Get contract counts per team (simple aggregate)
    const { data: contracts, error: contractErr } = await supabaseAdmin
      .from('contracts')
      .select('team_id, salary, player_id')
      .in('team_id', teamIds)
      .eq('saved_game_id', savedGameId);

    if (contractErr) throw new Error(`Failed to fetch contracts: ${contractErr.message}`);

    // 3. Count contracts and find top earner per team
    const teamContractCount = {};
    const teamTopEarner = {};   // { teamId: { playerId, salary } }
    const playerIds = new Set();

    for (const c of contracts) {
      teamContractCount[c.team_id] = (teamContractCount[c.team_id] || 0) + 1;
      if (!teamTopEarner[c.team_id] || c.salary > teamTopEarner[c.team_id].salary) {
        teamTopEarner[c.team_id] = { playerId: c.player_id, salary: c.salary };
      }
      playerIds.add(c.player_id);
    }

    // 4. Fetch player names/ratings for top earners
    let playerMap = {};
    if (playerIds.size > 0) {
      const { data: players, error: playerErr } = await supabaseAdmin
        .from('players')
        .select('id, full_name, overall_rating')
        .in('id', Array.from(playerIds));
      if (playerErr) throw new Error(`Failed to fetch players: ${playerErr.message}`);
      for (const p of players) {
        playerMap[p.id] = p;
      }
    }

    const STANDARD_CAP = 140500000;

    return teams.map(team => {
      const topEarner = teamTopEarner[team.id];
      const playerInfo = topEarner ? playerMap[topEarner.playerId] : null;
      return {
        id: team.id,
        name: team.name,
        city: team.city,
        abbreviation: team.abbreviation,
        totalPayroll: team.total_payroll || 0,
        salaryCapSpace: team.salary_cap_space || 0,
        capHitPercent: ((team.total_payroll / STANDARD_CAP) * 100).toFixed(1),
        luxuryTaxThreshold: STANDARD_CAP,
        playersUnderContract: teamContractCount[team.id] || 0,
        topEarner: playerInfo ? {
          playerName: playerInfo.name,
          overall: playerInfo.overall_rating,
          salary: topEarner.salary
        } : null
      };
    });
  }

  // ---------- Single Team Detailed View ----------
  static async getTeamFinanceDetail(savedGameId, teamId) {
    // 1. Fetch team info
    const { data: team, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .eq('saved_game_id', savedGameId)
      .single();
    if (teamErr || !team) return null;

    // 2. Fetch all contracts for this team
    const { data: contracts, error: contractErr } = await supabaseAdmin
      .from('contracts')
      .select('id, salary, years_remaining, total_years, player_id')
      .eq('team_id', teamId)
      .eq('saved_game_id', savedGameId)
      .order('salary', { ascending: false });
    if (contractErr) throw new Error(`Failed to load contracts: ${contractErr.message}`);

    // 3. Fetch all players for these contracts in one go
    const playerIds = contracts.map(c => c.player_id);
    let playersMap = {};
    if (playerIds.length > 0) {
      const { data: players, error: playerErr } = await supabaseAdmin
        .from('players')
        .select('id, full_name, position, overall_rating, age')
        .in('id', playerIds);
      if (playerErr) throw new Error(`Failed to load players: ${playerErr.message}`);
      for (const p of players) {
        playersMap[p.id] = p;
      }
    }

    // 4. Build contract objects with player data merged
    const contractList = contracts.map(c => {
      const player = playersMap[c.player_id] || {};
      return {
        contractId: c.id,
        playerId: c.player_id,
        playerName: player.full_name || 'Unknown',
        position: player.position || '',
        overall: player.overall_rating || 0,
        age: player.age || 0,
        salary: c.salary,
        yearsRemaining: c.years_remaining,
        totalYears: c.total_years
      };
    });

    const totalPayroll = contracts.reduce((sum, c) => sum + c.salary, 0);
    const STANDARD_CAP = 140500000;
    const capSpace = STANDARD_CAP - totalPayroll;

    // Highest paid player
    const highest = contractList[0] || null;
    // Expiring contracts (years remaining <= 1)
    const expiring = contractList.filter(c => c.yearsRemaining <= 1);

    return {
      team: {
        id: team.id,
        name: team.name,
        city: team.city,
        abbreviation: team.abbreviation,
        conference: team.conference,
        division: team.division
      },
      finances: {
        totalPayroll,
        salaryCap: STANDARD_CAP,
        capSpace,
        luxuryTaxSpace: capSpace,  // adjust when luxury tax is added
        numberOfContracts: contractList.length,
        highestPaidPlayer: highest ? {
          playerId: highest.playerId,
          name: highest.playerName,
          position: highest.position,
          overall: highest.overall,
          age: highest.age,
          salary: highest.salary,
          yearsRemaining: highest.yearsRemaining
        } : null,
        expiringContracts: expiring.map(c => ({
          playerId: c.playerId,
          name: c.playerName,
          position: c.position,
          overall: c.overall,
          salary: c.salary,
          yearsRemaining: c.yearsRemaining
        }))
      },
      contracts: contractList
    };
  }

static async getLeagueFinanceSummary(savedGameId) {
  // 1. All teams with payroll
  const { data: teams, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, abbreviation, total_payroll')
    .eq('saved_game_id', savedGameId);
  if (teamErr) throw new Error(`Failed to fetch teams: ${teamErr.message}`);

  // 2. Contracts with player data in one query (using foreign key relationship)
  const { data: contracts, error: contractErr } = await supabaseAdmin
    .from('contracts')
    .select(`
      salary,
      player_id,
      team_id,
      players ( full_name, overall_rating, team_id )
    `)
    .eq('saved_game_id', savedGameId);
  if (contractErr) throw new Error(`Failed to fetch contracts: ${contractErr.message}`);

  // 3. Build team map and process data
  const teamMap = {};
  teams.forEach(t => { teamMap[t.id] = t.name; });

  // Compute totals
  const totalPayroll = teams.reduce((sum, t) => sum + (t.total_payroll || 0), 0);
  const averagePayroll = teams.length ? totalPayroll / teams.length : 0;

  // Highest/lowest payroll teams
  const sortedByPayroll = [...teams].sort((a, b) => (b.total_payroll || 0) - (a.total_payroll || 0));
  const highestPayrollTeam = sortedByPayroll[0] ? {
    id: sortedByPayroll[0].id,
    name: sortedByPayroll[0].name,
    payroll: sortedByPayroll[0].total_payroll || 0
  } : null;
  const lowestPayrollTeam = sortedByPayroll[sortedByPayroll.length - 1] ? {
    id: sortedByPayroll[sortedByPayroll.length - 1].id,
    name: sortedByPayroll[sortedByPayroll.length - 1].name,
    payroll: sortedByPayroll[sortedByPayroll.length - 1].total_payroll || 0
  } : null;

  const totalContracts = contracts.length;
  const totalSalary = contracts.reduce((sum, c) => sum + c.salary, 0);
  const averageSalary = totalContracts ? totalSalary / totalContracts : 0;

  // Top 5 highest paid players
  const sortedContracts = [...contracts].sort((a, b) => b.salary - a.salary);
  const top5 = sortedContracts.slice(0, 5).map(c => {
    const player = c.players || {};  // nested player data
    const teamName = player.team_id ? teamMap[player.team_id] : 'Unknown';
    return {
      playerName: player.full_name || 'Unknown',
      overall: player.overall_rating || 0,
      team: teamName,
      salary: c.salary
    };
  });

  return {
    totalTeams: teams.length,
    totalLeaguePayroll: totalPayroll,
    averageTeamPayroll: Math.round(averagePayroll),
    highestPayrollTeam,
    lowestPayrollTeam,
    totalPlayersUnderContract: totalContracts,
    averagePlayerSalary: Math.round(averageSalary),
    top5HighestPaid: top5
  };
}
}

module.exports = FinanceService;