// services/financeService.js
const { supabaseAdmin } = require('../config/supabase');

// ── League Financial Constants ─────────────────────────────────────────────
// Modeled loosely on real-world salary structures. No second-apron logic —
// only a standard cap and a single luxury tax line with progressive brackets.

const SALARY_CAP        = 140_500_000;   // soft cap
const LUXURY_TAX_LINE    = 170_800_000;   // tax apron (first apron only, no second apron)

// Rookie-scale / veteran minimum salary by "years of experience" (age - 19, capped 0-10)
const MIN_SALARY_SCALE = [
  1_160_000, // 0 yrs (rookie)
  1_874_000, // 1
  2_087_000, // 2
  2_166_000, // 3
  2_296_000, // 4
  2_467_000, // 5
  2_667_000, // 6
  2_867_000, // 7
  3_067_000, // 8
  3_267_000, // 9
  3_623_000, // 10+
];

// Progressive luxury tax brackets — $ owed per $1 over the tax line, applied
// incrementally to each slice (mirrors how real luxury tax scales work).
const LUXURY_TAX_BRACKETS = [
  { upTo: 5_000_000,  rate: 1.50 },
  { upTo: 10_000_000, rate: 1.75 },
  { upTo: 15_000_000, rate: 2.50 },
  { upTo: 20_000_000, rate: 3.25 },
  { upTo: Infinity,   rate: 3.75 }, // + 0.50 for every additional $5M beyond this handled below
];

// add near the player salary constants
const COACH_SALARY_TIERS = [
  { min: 88, range: [8_000_000, 12_000_000] },
  { min: 80, range: [5_000_000, 8_000_000] },
  { min: 72, range: [3_000_000, 5_000_000] },
  { min: 64, range: [1_500_000, 3_000_000] },
  { min: 0,  range: [800_000,   1_500_000] },
];

class FinanceService {

  // ── Salary helpers ─────────────────────────────────────────────────────

  /**
   * Veteran-minimum salary for a player of a given age, scaled by
   * approximate years of experience (age 19 = rookie).
   */
  static getMinSalaryForAge(age) {
    const experience = Math.max(0, Math.min((age || 19) - 19, MIN_SALARY_SCALE.length - 1));
    return MIN_SALARY_SCALE[experience];
  }

  /**
   * Determine a player's base salary from their overall rating, using tiers
   * that approximate real max/starter/rotation/minimum pay bands, expressed
   * as a percentage of the salary cap where relevant (max contracts scale
   * with the cap, minimums scale with experience).
   */
  static getBaseSalary(overall, age) {
    const minSalary = FinanceService.getMinSalaryForAge(age);

    if (overall >= 90) {
      // Superstar / max tier — 27%-35% of the cap depending on rating
      const pct = 0.27 + Math.min(overall - 90, 9) * 0.009; // caps near 0.35
      return Math.round(SALARY_CAP * pct);
    }
    if (overall >= 84) {
      // All-Star tier
      const pct = 0.16 + (overall - 84) * 0.018;
      return Math.round(SALARY_CAP * pct);
    }
    if (overall >= 78) {
      // Quality starter tier
      const pct = 0.07 + (overall - 78) * 0.015;
      return Math.round(SALARY_CAP * pct);
    }
    if (overall >= 70) {
      // Rotation player tier
      const pct = 0.02 + (overall - 70) * 0.006;
      return Math.round(Math.max(SALARY_CAP * pct, minSalary * 1.3));
    }
    // Bench / fringe roster tier — hovers around the veteran minimum
    return Math.round(minSalary * (1 + Math.max(0, overall - 60) * 0.01));
  }

  /**
   * Contract length, weighted toward realistic distributions:
   * stars on winning teams sign long-term deals, older/fringe players sign
   * short "prove-it" or minimum-scale deals.
   */
  static getContractYears(overall, age) {
    let pool;
    if (overall >= 90) {
      pool = age <= 30 ? [4, 4, 5, 5, 5] : [1, 2, 3, 3];
    } else if (overall >= 84) {
      pool = age <= 31 ? [3, 3, 4, 4, 5] : [1, 2, 2, 3];
    } else if (overall >= 78) {
      pool = age <= 32 ? [2, 3, 3, 4] : [1, 1, 2, 2];
    } else if (overall >= 70) {
      pool = age <= 28 ? [1, 2, 2, 3] : [1, 1, 2];
    } else {
      pool = age <= 25 ? [1, 1, 2, 2] : [1, 1];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Progressive luxury tax owed on payroll above the tax line. Uses
   * incremental brackets (not a flat rate on the whole overage), then adds
   * $0.50/$1 for every further $5M once past the top defined bracket —
   * intentionally excludes second-apron restrictions/penalties.
   */
  static calculateLuxuryTax(totalPayroll) {
    const overage = totalPayroll - LUXURY_TAX_LINE;
    if (overage <= 0) return 0;

    let remaining = overage;
    let taxOwed   = 0;
    let previousCap = 0;

    for (const bracket of LUXURY_TAX_BRACKETS) {
      const bracketSize = bracket.upTo - previousCap;
      const taxableInBracket = Math.min(remaining, bracketSize === Infinity ? remaining : bracketSize);

      if (bracket.upTo === Infinity) {
        // Beyond the last defined bracket: base rate, +0.50 per additional $5M chunk
        const chunks = Math.floor(remaining / 5_000_000);
        let rate = bracket.rate;
        let owedHere = 0;
        let left = remaining;
        let chunkIndex = 0;
        while (left > 0) {
          const chunkAmount = Math.min(left, 5_000_000);
          owedHere += chunkAmount * (rate + chunkIndex * 0.50);
          left -= chunkAmount;
          chunkIndex++;
        }
        taxOwed += owedHere;
        remaining = 0;
        break;
      } else {
        taxOwed += taxableInBracket * bracket.rate;
        remaining -= taxableInBracket;
        previousCap = bracket.upTo;
        if (remaining <= 0) break;
      }
    }

    return Math.round(taxOwed);
  }

  static buildCapSummary(totalPayroll) {
    const capSpace     = SALARY_CAP - totalPayroll;
    const isOverCap     = totalPayroll > SALARY_CAP;
    const isOverTax      = totalPayroll > LUXURY_TAX_LINE;
    const luxuryTaxOwed = isOverTax ? FinanceService.calculateLuxuryTax(totalPayroll) : 0;

    return {
      salaryCap: SALARY_CAP,
      luxuryTaxLine: LUXURY_TAX_LINE,
      capSpace,
      isOverCap,
      isOverLuxuryTax: isOverTax,
      luxuryTaxOwed,
    };
  }

  // ── League initialization ────────────────────────────────────────────

  /**
   * Initializes financial contracts and payrolls for a newly created league.
   * @param {string} savedGameId
   * @param {Array} teams
   * @param {Array} players
   */
  static async initializeLeagueFinances(savedGameId, teams, players) {
    try {
      const contractsToInsert = [];

      const teamPayrollMap = {};
      teams.forEach(team => {
        teamPayrollMap[team.id] = 0;
      });

      for (const player of players) {
        if (!player.team_id) continue;

        const overall = player.overall_rating;
        const age     = player.age;

        const baseSalary = FinanceService.getBaseSalary(overall, age);
        const years       = FinanceService.getContractYears(overall, age);

        // Small realistic variance (+/- 5%) so identical-rated players
        // don't all sign for the exact same number.
        const variance = (Math.random() * 0.1) - 0.05;
        const finalizedSalary = Math.round(baseSalary * (1 + variance));

        contractsToInsert.push({
          saved_game_id: savedGameId,
          player_id: player.id,
          team_id: player.team_id,
          salary: finalizedSalary,
          years_remaining: years,
          total_years: years,
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

      const teamUpdates = Object.keys(teamPayrollMap).map(async (teamId) => {
        const payroll = teamPayrollMap[teamId];
        const capSpace = SALARY_CAP - payroll;

        return supabaseAdmin
          .from('teams')
          .update({
            total_payroll: payroll,
            salary_cap_space: capSpace,
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
   * Returns array of objects with payroll, cap space, luxury tax, top earner, etc.
   */
  static async getAllTeamFinances(savedGameId) {
    const { data: teams, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, city, abbreviation, total_payroll, salary_cap_space')
      .eq('saved_game_id', savedGameId);

    if (teamErr) throw new Error(`Failed to fetch teams: ${teamErr.message}`);
    if (!teams || teams.length === 0) return [];

    const teamIds = teams.map(t => t.id);

    const { data: contracts, error: contractErr } = await supabaseAdmin
      .from('contracts')
      .select('team_id, salary, player_id')
      .in('team_id', teamIds)
      .eq('saved_game_id', savedGameId);

    if (contractErr) throw new Error(`Failed to fetch contracts: ${contractErr.message}`);

    const teamContractCount = {};
    const teamTopEarner = {};
    const playerIds = new Set();

    for (const c of contracts) {
      teamContractCount[c.team_id] = (teamContractCount[c.team_id] || 0) + 1;
      if (!teamTopEarner[c.team_id] || c.salary > teamTopEarner[c.team_id].salary) {
        teamTopEarner[c.team_id] = { playerId: c.player_id, salary: c.salary };
      }
      playerIds.add(c.player_id);
    }

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

    return teams.map(team => {
      const topEarner  = teamTopEarner[team.id];
      const playerInfo = topEarner ? playerMap[topEarner.playerId] : null;
      const payroll    = team.total_payroll || 0;
      const capSummary = FinanceService.buildCapSummary(payroll);

      return {
        id: team.id,
        name: team.name,
        city: team.city,
        abbreviation: team.abbreviation,
        totalPayroll: payroll,
        salaryCapSpace: capSummary.capSpace,
        capHitPercent: ((payroll / SALARY_CAP) * 100).toFixed(1),
        salaryCap: SALARY_CAP,
        luxuryTaxThreshold: LUXURY_TAX_LINE,
        isOverCap: capSummary.isOverCap,
        isOverLuxuryTax: capSummary.isOverLuxuryTax,
        luxuryTaxOwed: capSummary.luxuryTaxOwed,
        playersUnderContract: teamContractCount[team.id] || 0,
        topEarner: playerInfo ? {
          playerName: playerInfo.full_name,
          overall: playerInfo.overall_rating,
          salary: topEarner.salary,
        } : null,
      };
    });
  }

  // ---------- Single Team Detailed View ----------
  static async getTeamFinanceDetail(savedGameId, teamId) {
    const { data: team, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .eq('saved_game_id', savedGameId)
      .single();
    if (teamErr || !team) return null;

    const { data: contracts, error: contractErr } = await supabaseAdmin
      .from('contracts')
      .select('id, salary, years_remaining, total_years, player_id')
      .eq('team_id', teamId)
      .eq('saved_game_id', savedGameId)
      .order('salary', { ascending: false });
    if (contractErr) throw new Error(`Failed to load contracts: ${contractErr.message}`);

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
        totalYears: c.total_years,
      };
    });

    const totalPayroll = contracts.reduce((sum, c) => sum + c.salary, 0);
    const capSummary   = FinanceService.buildCapSummary(totalPayroll);

    const highest  = contractList[0] || null;
    const expiring = contractList.filter(c => c.yearsRemaining <= 1);

    return {
      team: {
        id: team.id,
        name: team.name,
        city: team.city,
        abbreviation: team.abbreviation,
        conference: team.conference,
        division: team.division,
      },
      finances: {
        totalPayroll,
        salaryCap: SALARY_CAP,
        capSpace: capSummary.capSpace,
        isOverCap: capSummary.isOverCap,
        luxuryTaxLine: LUXURY_TAX_LINE,
        isOverLuxuryTax: capSummary.isOverLuxuryTax,
        luxuryTaxOwed: capSummary.luxuryTaxOwed,
        numberOfContracts: contractList.length,
        highestPaidPlayer: highest ? {
          playerId: highest.playerId,
          name: highest.playerName,
          position: highest.position,
          overall: highest.overall,
          age: highest.age,
          salary: highest.salary,
          yearsRemaining: highest.yearsRemaining,
        } : null,
        expiringContracts: expiring.map(c => ({
          playerId: c.playerId,
          name: c.playerName,
          position: c.position,
          overall: c.overall,
          salary: c.salary,
          yearsRemaining: c.yearsRemaining,
        })),
      },
      contracts: contractList,
    };
  }

  static async getLeagueFinanceSummary(savedGameId) {
    const { data: teams, error: teamErr } = await supabaseAdmin
      .from('teams')
      .select('id, name, abbreviation, total_payroll')
      .eq('saved_game_id', savedGameId);
    if (teamErr) throw new Error(`Failed to fetch teams: ${teamErr.message}`);

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

    const teamMap = {};
    teams.forEach(t => { teamMap[t.id] = t.name; });

    const totalPayroll   = teams.reduce((sum, t) => sum + (t.total_payroll || 0), 0);
    const averagePayroll = teams.length ? totalPayroll / teams.length : 0;

    const sortedByPayroll = [...teams].sort((a, b) => (b.total_payroll || 0) - (a.total_payroll || 0));
    const highestPayrollTeam = sortedByPayroll[0] ? {
      id: sortedByPayroll[0].id,
      name: sortedByPayroll[0].name,
      payroll: sortedByPayroll[0].total_payroll || 0,
    } : null;
    const lowestPayrollTeam = sortedByPayroll[sortedByPayroll.length - 1] ? {
      id: sortedByPayroll[sortedByPayroll.length - 1].id,
      name: sortedByPayroll[sortedByPayroll.length - 1].name,
      payroll: sortedByPayroll[sortedByPayroll.length - 1].total_payroll || 0,
    } : null;

    // Luxury tax standing across the league
    const teamsOverTax = teams.filter(t => (t.total_payroll || 0) > LUXURY_TAX_LINE);
    const totalLeagueTaxCollected = teamsOverTax.reduce(
      (sum, t) => sum + FinanceService.calculateLuxuryTax(t.total_payroll || 0),
      0
    );

    const totalContracts = contracts.length;
    const totalSalary    = contracts.reduce((sum, c) => sum + c.salary, 0);
    const averageSalary  = totalContracts ? totalSalary / totalContracts : 0;

    const sortedContracts = [...contracts].sort((a, b) => b.salary - a.salary);
    const top5 = sortedContracts.slice(0, 5).map(c => {
      const player   = c.players || {};
      const teamName = player.team_id ? teamMap[player.team_id] : 'Unknown';
      return {
        playerName: player.full_name || 'Unknown',
        overall: player.overall_rating || 0,
        team: teamName,
        salary: c.salary,
      };
    });

    return {
      salaryCap: SALARY_CAP,
      luxuryTaxLine: LUXURY_TAX_LINE,
      totalTeams: teams.length,
      totalLeaguePayroll: totalPayroll,
      averageTeamPayroll: Math.round(averagePayroll),
      highestPayrollTeam,
      lowestPayrollTeam,
      teamsOverLuxuryTax: teamsOverTax.length,
      totalLeagueLuxuryTaxCollected: totalLeagueTaxCollected,
      totalPlayersUnderContract: totalContracts,
      averagePlayerSalary: Math.round(averageSalary),
      top5HighestPaid: top5,
    };
  };

    static getCoachSalary(overall) {
    const tier = COACH_SALARY_TIERS.find(t => overall >= t.min);
    const [min, max] = tier.range;
    return Math.round(min + Math.random() * (max - min));
  }

  static getCoachContractYears(overall) {
    const pool = overall >= 85 ? [4, 5, 5, 6]
              : overall >= 72 ? [3, 3, 4]
              : [1, 2, 2, 3];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  static async initializeCoachContracts(savedGameId, coaches) {
    const rows = coaches
      .filter(c => c.team_id)
      .map(c => {
        const salary = FinanceService.getCoachSalary(c.overall_rating);
        const years = FinanceService.getCoachContractYears(c.overall_rating);
        return {
          saved_game_id: savedGameId,
          coach_id: c.id,
          team_id: c.team_id,
          salary,
          years_remaining: years,
          total_years: years,
        };
      });

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('coach_contracts').insert(rows);
      if (error) throw new Error(`Failed to create coach contracts: ${error.message}`);
    }
    return rows.length;
  }
}

module.exports = FinanceService;