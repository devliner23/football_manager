// testLeague.js
const { createLeague } = require('./services/leagueService');

// Generate the league
const league = createLeague();

console.log('🏀 LEAGUE GENERATED SUCCESSFULLY');
console.log(`Total teams: ${league.teams.length}`);

// Show team summaries
league.teams.forEach((team, idx) => {
  const sorted = [...team.players].sort((a, b) => b.overall - a.overall);
  const avgOverall = team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length;
  const topPlayer = sorted[0];
  console.log(`\n${idx+1}. ${team.city} ${team.name} (${team.abbreviation})`);
  console.log(`   Avg Overall: ${avgOverall.toFixed(1)}`);
  console.log(`   Best: ${topPlayer.firstName} ${topPlayer.lastName} (${topPlayer.position}) - ${topPlayer.overall} overall`);
  console.log(`   Starters: ${team.starters.map(id => {
    const p = team.players.find(p => p.id === id);
    return `${p.firstName[0]}.${p.lastName} (${p.overall})`;
  }).join(', ')}`);
});

// Show overall distribution
const allOverall = league.teams.flatMap(t => t.players.map(p => p.overall));
const avg = allOverall.reduce((a, b) => a + b, 0) / allOverall.length;
const max = Math.max(...allOverall);
const min = Math.min(...allOverall);
const sortedOverall = [...allOverall].sort((a, b) => a - b);
const median = sortedOverall[Math.floor(sortedOverall.length / 2)];
const countElite = allOverall.filter(o => o >= 90).length;

console.log('\n📊 LEAGUE OVERALL STATISTICS');
console.log(`Total players: ${allOverall.length}`);
console.log(`Average Overall: ${avg.toFixed(1)}`);
console.log(`Median Overall: ${median}`);
console.log(`Min: ${min}, Max: ${max}`);
console.log(`Players with overall ≥ 90 (elite): ${countElite}`);
console.log(`Distribution: ${countElite} elite, ${allOverall.filter(o => o >= 80 && o < 90).length} stars, ${allOverall.filter(o => o >= 70 && o < 80).length} good, ${allOverall.filter(o => o < 70).length} role players.`);