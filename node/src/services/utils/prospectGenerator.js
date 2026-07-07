/**
 * Generates a pool of prospect objects for a given saved game and draft class.
 * @param {string} savedGameId - UUID of the saved game.
 * @param {number} draftClassYear - e.g. 2025
 * @param {number} poolSize - number of prospects (default 60)
 * @returns {Array} Array of prospect objects ready for insertion.
 */
function generateProspectPool(savedGameId, draftClassYear, poolSize = 60) {
  const prospects = [];

  for (let i = 0; i < poolSize; i++) {
    prospects.push(generateSingleProspect(savedGameId, draftClassYear));
  }

  // Sort by overall rating descending (optional, for draft board realism)
  return prospects.sort((a, b) => b.overall_rating - a.overall_rating);
}

/**
 * Generates one realistic prospect.
 */
function generateSingleProspect(savedGameId, draftClassYear) {
  const position = pickRandom(POSITIONS);
  const archetype = pickRandom(ARCHETYPES_BY_POSITION[position]);
  const { first, last } = generateName();
  const age = randomInt(19, 22);
  const college = pickRandom(COLLEGES);
  const collegeClass = ageToCollegeClass(age);

  // Core ratings
  const overall = randomRating(55, 82, 9); // bell-curve peak around 68
  const potential = clamp(overall + randomInt(-5, 15), 30, 99);

  // Generate skill ratings based on position and archetype
  const skills = generateSkills(position, archetype, overall);
  const traits = buildTraitsObject(skills);

  // Physical measurements
  const height = randomHeight(position);
  const weight = randomWeight(height);
  const wingspan = randomInt(Math.round(height * 0.95), Math.round(height * 1.1));
  const standingReach = Math.round((height * 0.8 + wingspan * 0.2) * 10) / 10;
  const handLength = parseFloat((7.5 + randomInt(0, 3) * 0.5).toFixed(1));
  const handWidth = parseFloat((8.5 + randomInt(0, 3) * 0.5).toFixed(1));
  const bodyFatPct = parseFloat((5 + Math.random() * 10).toFixed(1));

  // Intangibles
  const intangibles = generateIntangibles(overall);

  // Draft projection
  const projectedRange = getProjectedRange(overall);

  // Traits (0–3 random traits)
  const traitTagCount = randomInt(0, 3);
  const traitTags = [];
    for (let t = 0; t < traitTagCount; t++) {
    traitTags.push(pickRandom(TRAITS));
  }

  // College stats (loosely tied to overall)
  const stats = generateCollegeStats(position, overall);

  // Awards
  const awards = generateAwards(overall);

  // Combine results
  const combine = generateCombine(position, overall);

  // Player comparisons (optional)
  const comp1 = pickRandom(NBA_PLAYERS);
  const comp2 = pickRandom(NBA_PLAYERS.filter(p => p !== comp1));

  // Social media / NIL (random)
  const socialMedia = randomInt(1000, 5000000);
  const nilValuation = Math.round(socialMedia * 0.001) * 1000; // rough

  return {
    saved_game_id: savedGameId,
    first_name: first,
    last_name: last,
    position,
    age,
    height,
    weight,
    overall_rating: overall,
    potential_rating: potential,
    ...skills,
    college,
    college_class: collegeClass,
    hometown_city: pickRandom(CITIES),
    hometown_state: pickRandom(STATES),
    hometown_country: 'USA',
    nationality: 'American',
    high_school: `${pickRandom(HIGH_SCHOOL_PREFIXES)} High School`,
    jersey_number: randomInt(0, 99),
    draft_class_year: draftClassYear,
    projected_draft_range: projectedRange,
    draft_status: 'available',
    draft_position: null,
    drafted_by_team_id: null,
    player_archetype: archetype,
    traits,
    trait_tags: traitTags,
    ...stats,
    wingspan,
    standing_reach: standingReach,
    hand_length: handLength,
    hand_width: handWidth,
    body_fat_pct: bodyFatPct,
    ...intangibles,
    character_concerns: Math.random() < 0.1, // 10% have concerns
    scouting_notes: null,
    player_comparison_1: comp1,
    player_comparison_2: comp2,
    social_media_following: socialMedia,
    nil_valuation: nilValuation,
    ...combine,
    awards: JSON.stringify(awards),
    tournament_appearances: randomInt(0, 4),
    final_four_appearances: Math.random() < 0.15 ? 1 : 0,
    championships: Math.random() < 0.08 ? 1 : 0,
    development_trend: pickRandom(['Rising', 'Stable', 'Stable', 'Falling']),
    breakout_potential: getBreakoutPotential(potential, overall),
  };
}

// ---------- Helper functions ----------

/** Clamps value between min and max */
function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

/** Random integer between min and max inclusive */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random element from array */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns a rating with a bell-curve distribution.
 * @param {number} min - minimum rating
 * @param {number} max - maximum rating
 * @param {number} peak - the most probable value (mode)
 */
function randomRating(min, max, peak) {
  // Box-Muller approximation using central limit theorem
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += Math.random();
  let z = (sum - 3) / Math.sqrt(0.5); // ~standard normal
  let raw = peak + z * 6; // spread of 6 rating points per std dev
  return clamp(Math.round(raw), min, max);
}

/** Generate first and last name */
function generateName() {
  const first = pickRandom(FIRST_NAMES);
  const last = pickRandom(LAST_NAMES);
  return { first, last };
}

/** Map age to college class (18-19 → Freshman, etc.) */
function ageToCollegeClass(age) {
  if (age <= 19) return 'Freshman';
  if (age === 20) return Math.random() < 0.5 ? 'Freshman' : 'Sophomore';
  if (age === 21) return Math.random() < 0.3 ? 'Sophomore' : 'Junior';
  return Math.random() < 0.4 ? 'Junior' : 'Senior';
}

/** Random height in inches based on position */
function randomHeight(pos) {
  const [min, max] = playerData.positionHeights[pos] || [72, 78];
  return randomInt(min, max);
}

/** Weight based on height and position (rough formula) */
function randomWeight(height) {
  const base = (height - 65) * 10 + 160;
  return clamp(base + randomInt(-20, 20), 160, 290);
}

/** Generate skill ratings based on position and archetype */
function generateSkills(position, archetype, overall) {
  const base = overall;
  return {
    inside_scoring:     clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'inside'), 30, 99),
    mid_range:          clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'midrange'), 30, 99),
    three_point:        clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'three'), 30, 99),
    free_throw:         clamp(base + randomInt(-5, 5), 30, 99),
    ball_handling:      clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'handle'), 30, 99),
    passing:            clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'passing'), 30, 99),
    offensive_iq:       clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'offIQ'), 30, 99),
    defensive_iq:       clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'defIQ'), 30, 99),
    perimeter_defense:  clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'perimD'), 30, 99),
    post_defense:       clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'interiorD'), 30, 99),
    shot_blocking:      clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'block'), 30, 99),
    rebounding:         clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'rebound'), 30, 99),
    speed:              clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'speed'), 30, 99),
    strength:           clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'strength'), 30, 99),
    vertical:           clamp(base + randomInt(-5, 5) + archetypeMod(archetype, 'vertical'), 30, 99),
    stamina:            clamp(base + randomInt(-5, 5), 30, 99),
    durability:         clamp(base + randomInt(-5, 5), 30, 99),
  };
}

function buildTraitsObject(skills) {
  const traits = {};
  for (const [canonicalKey, flatColumn] of Object.entries(CANONICAL_TRAIT_MAP)) {
    traits[canonicalKey] = skills[flatColumn] ?? 50;
  }
  return traits;
}


/** Archetype modifier for skills. Adjusts specific skills up/down. */
function archetypeMod(archetype, skill) {
  const map = {
    Playmaker:        { handle: +6, passing: +8, speed: +4 },
    Sharpshooter:     { three: +10, midrange: +6, offIQ: +2 },
    Slasher:          { inside: +8, speed: +6, vertical: +6, handle: +4 },
    'Lockdown Defender': { perimD: +8, defIQ: +6, speed: +4, interiorD: +4 },
    'Rim Protector':  { block: +10, interiorD: +8, strength: +4, rebound: +4 },
    Rebounder:        { rebound: +10, strength: +6, interiorD: +4 },
    'Two-Way Star':   { perimD: +5, defIQ: +5, offIQ: +5, three: +4 },
    'Stretch Big':    { three: +8, midrange: +6, interiorD: +4 },
    'Interior Force': { inside: +10, strength: +8, rebound: +4 },
    'All-Around':     { handle: +3, passing: +3, perimD: +3, offIQ: +3 },
    '3-and-D':        { three: +6, perimD: +6, defIQ: +4 },
    'Point Forward':  { passing: +6, handle: +4, offIQ: +4, rebound: +4 },
    'Combo Guard':    { handle: +4, three: +4, speed: +4 },
    'Floor General':  { passing: +6, offIQ: +6, handle: +3 },
    'Scoring Machine': { midrange: +5, three: +5, inside: +5, handle: +3 },
  };
  const entry = map[archetype];
  return entry ? (entry[skill] || 0) : 0;
}

/** Generate intangibles */
function generateIntangibles(overall) {
  const tiers = ['Poor', 'Below Average', 'Average', 'Good', 'Excellent', 'Legendary'];
  const base = overall / 10; // 5.5 - 8.2 -> tier index roughly
  const workEthicIndex = clamp(Math.round(base + randomInt(-2, 2)), 0, 5);
  const iqIndex = clamp(Math.round(base + randomInt(-2, 2)), 0, 5);
  const leadershipIndex = clamp(Math.round(base + randomInt(-2, 2)), 0, 5);
  const injuryHistory = pickRandom(['None', 'None', 'None', 'Minor', 'Moderate']);
  return {
    work_ethic: tiers[workEthicIndex],
    basketball_iq: tiers[iqIndex],
    leadership: tiers[leadershipIndex],
    injury_history: injuryHistory,
  };
}

/** Draft projection based on overall */
function getProjectedRange(overall) {
  if (overall >= 78) return 'Lottery';
  if (overall >= 73) return 'Mid-First';
  if (overall >= 68) return 'Late-First';
  if (overall >= 63) return 'Early-Second';
  if (overall >= 58) return 'Late-Second';
  return 'Undrafted';
}

/** Breakout potential based on potential minus overall */
function getBreakoutPotential(potential, overall) {
  const diff = potential - overall;
  if (diff >= 12) return 'Very High';
  if (diff >= 8) return 'High';
  if (diff >= 4) return 'Medium';
  return 'Low';
}

/** Generate fake college stats */
function generateCollegeStats(position, overall) {
  const ppgBase = (overall / 2) - 10 + randomInt(-2, 4);
  const rpgBase = (position === 'C' || position === 'PF') ? 6 : 3;
  const apgBase = (position === 'PG') ? 5 : 2;
  return {
    college_ppg: parseFloat((ppgBase + randomInt(-1, 2)).toFixed(1)),
    college_rpg: parseFloat((rpgBase + randomInt(-1, 3)).toFixed(1)),
    college_apg: parseFloat((apgBase + randomInt(-1, 2)).toFixed(1)),
    college_spg: parseFloat((0.5 + Math.random() * 1.5).toFixed(1)),
    college_bpg: parseFloat((position === 'C' ? 1.5 : 0.3 + Math.random() * 1).toFixed(1)),
    college_fg_pct: parseFloat((40 + Math.random() * 20).toFixed(1)),
    college_three_pct: parseFloat((28 + Math.random() * 18).toFixed(1)),
    college_ft_pct: parseFloat((60 + Math.random() * 30).toFixed(1)),
    college_minutes: parseFloat((20 + Math.random() * 15).toFixed(1)),
  };
}

/** Generate awards */
function generateAwards(overall) {
  const awards = [];
  if (overall >= 78 && Math.random() < 0.6) awards.push('All-American');
  if (overall >= 72 && Math.random() < 0.4) awards.push('Conference Player of the Year');
  if (overall >= 68 && Math.random() < 0.3) awards.push('All-Conference First Team');
  if (overall >= 65 && Math.random() < 0.3) awards.push('All-Conference Second Team');
  if (Math.random() < 0.2) awards.push('Academic All-American');
  return awards;
}

/** Generate combine results */
function generateCombine(position, overall) {
  const speedFactor = (overall / 100);
  const agility = 10.5 + (1 - speedFactor) * 2 + randomInt(-2, 2) * 0.1;
  const sprint = 2.9 + (1 - speedFactor) * 0.8 + randomInt(-2, 2) * 0.05;
  const standVert = 24 + speedFactor * 12 + randomInt(-4, 4);
  const maxVert = standVert + 8 + randomInt(-3, 3);
  const bench = (position === 'C' || position === 'PF') ? randomInt(8, 25) : randomInt(2, 15);
  return {
    lane_agility_time: parseFloat(agility.toFixed(2)),
    three_quarter_sprint: parseFloat(sprint.toFixed(2)),
    standing_vertical: parseFloat(standVert.toFixed(1)),
    max_vertical: parseFloat(maxVert.toFixed(1)),
    bench_press_reps: bench,
  };
}

// ---------- Data lists ----------

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

const ARCHETYPES_BY_POSITION = {
  PG: ['Playmaker', 'Floor General', 'Combo Guard', 'Sharpshooter', 'Two-Way Star'],
  SG: ['Sharpshooter', 'Scoring Machine', '3-and-D', 'Slasher', 'Combo Guard'],
  SF: ['All-Around', '3-and-D', 'Slasher', 'Point Forward', 'Lockdown Defender'],
  PF: ['Stretch Big', 'Interior Force', 'Rebounder', 'Two-Way Star', 'Rim Protector'],
  C:  ['Rim Protector', 'Interior Force', 'Rebounder', 'Stretch Big', 'Two-Way Star'],
};

const TRAITS = [
  'Clutch', 'Leader', 'Hard Worker', 'High Motor', 'Unselfish',
  'Physical', 'Finesse', 'Vocal', 'Confident', 'Resilient',
  'Quick Learner', 'Team Player', 'Alpha Dog', 'Spark Plug'
];

const CANONICAL_TRAIT_MAP = {
  three_point:        'three_point_scoring',
  mid_range:           'mid_range_scoring',
  inside_scoring:      'inside_scoring',
  passing:             'passing',
  ball_handling:       'ball_handling',
  perimeter_defense:   'perimeter_defense',
  post_defense:        'interior_defense',
  rebounding:          'rebounding',
  speed:               'speed',
  strength:            'strength',
};

const FIRST_NAMES = [
  'Jalen', 'Malik', 'Cade', 'Emoni', 'Scoot', 'Cam', 'Jabari', 'Paolo',
  'Chet', 'Amen', 'Ausar', 'Brandon', 'Nick', 'Anthony', 'Tyrese',
  'Ja', 'Zion', 'Luka', 'Trae', 'Jayson', 'Jaylen', 'Bam', 'Donovan',
  'Shai', 'DeAaron', 'Jamal', 'Darius', 'Evan', 'Scottie', 'Franz',
  'Alperen', 'Victor', 'Cason', 'Gradey', 'Keyonte', 'Bilal', 'Dereck',
];

const LAST_NAMES = [
  'Green', 'Cunningham', 'Bates', 'Henderson', 'Whitmore', 'Smith', 'Banchero',
  'Holmgren', 'Thompson', 'Miller', 'Williams', 'Edwards', 'Ball', 'Haliburton',
  'Morant', 'Williamson', 'Doncic', 'Young', 'Tatum', 'Brown', 'Adebayo',
  'Mitchell', 'Gilgeous-Alexander', 'Fox', 'Murray', 'Garland', 'Mobley',
  'Barnes', 'Wagner', 'Sengun', 'Wembanyama', 'Wallace', 'Dick', 'George',
  'Coulibaly', 'Lively',
];

const COLLEGES = [
  'Duke', 'Kentucky', 'Kansas', 'North Carolina', 'Villanova', 'Gonzaga',
  'UCLA', 'Michigan', 'Michigan State', 'Arizona', 'Texas', 'Baylor',
  'Auburn', 'Alabama', 'Tennessee', 'Arkansas', 'Illinois', 'Purdue',
  'Indiana', 'Ohio State', 'Florida', 'LSU', 'USC', 'Oregon', 'Virginia',
  'Florida State', 'Memphis', 'Houston', 'UConn', 'Syracuse',
];

const CITIES = [
  'Los Angeles', 'Chicago', 'New York', 'Houston', 'Philadelphia',
  'Dallas', 'Miami', 'Atlanta', 'Seattle', 'Oakland', 'Detroit',
  'Indianapolis', 'Charlotte', 'Portland', 'Cleveland',
];

const STATES = [
  'CA', 'IL', 'NY', 'TX', 'PA', 'FL', 'GA', 'WA', 'MI', 'IN', 'NC', 'OR', 'OH',
];

const HIGH_SCHOOL_PREFIXES = [
  'Oak Hill Academy', 'Sierra Canyon', 'Montverde Academy', 'IMG Academy',
  'Sunrise Christian', 'Wasatch Academy', 'La Lumiere', 'Prolific Prep',
  'Link Academy', 'Brewster Academy',
];

const NBA_PLAYERS = [
  'Jayson Tatum', 'Kevin Durant', 'LeBron James', 'Stephen Curry',
  'Giannis Antetokounmpo', 'Luka Doncic', 'Joel Embiid', 'Nikola Jokic',
  'Jimmy Butler', 'Devin Booker', 'Donovan Mitchell', 'Bam Adebayo',
  'Anthony Davis', 'Paul George', 'Kawhi Leonard', 'Damian Lillard',
  'Trae Young', 'Ja Morant', 'Zion Williamson', 'Shai Gilgeous-Alexander',
];

module.exports = { generateProspectPool };