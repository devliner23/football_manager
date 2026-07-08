// src/components/SelectedGame/tabs/ProspectsTab.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { leagueAPI, Prospect } from '../../../api/leagueApi';
import {
  GraduationCap, TrendingUp, TrendingDown, Minus,
  Ruler, Zap, Shield, Target, Search, ChevronDown, X, AlertTriangle, Star
} from 'lucide-react';
import './styles/ProspectsTab.css';

interface ProspectsTabProps {
  savedGameId: string;
}

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

const SORT_OPTIONS = [
  { value: 'overall_rating', label: 'Overall Rating' },
  { value: 'potential_rating', label: 'Potential' },
  { value: 'college_ppg', label: 'PPG' },
  { value: 'age', label: 'Age (Youngest)' },
];

function heightLabel(inches: number) {
  const ft = Math.floor(inches / 12);
  const inch = inches % 12;
  return `${ft}'${inch}"`;
}

function tierFromRange(range: string): { label: string; className: string } {
  if (range === 'Lottery') return { label: 'Lottery', className: 'tier-lottery' };
  if (range === 'Mid-First') return { label: 'Mid 1st', className: 'tier-first' };
  if (range === 'Late-First') return { label: 'Late 1st', className: 'tier-first' };
  if (range === 'Early-Second') return { label: 'Early 2nd', className: 'tier-second' };
  if (range === 'Late-Second') return { label: 'Late 2nd', className: 'tier-second' };
  return { label: 'Undrafted', className: 'tier-undrafted' };
}

function ratingClass(val: number) {
  if (val >= 85) return 'stat-elite';
  if (val >= 75) return 'stat-good';
  if (val >= 60) return 'stat-avg';
  return 'stat-low';
}

const TRAIT_LABELS: Record<string, string> = {
  three_point: '3PT',
  mid_range: 'Mid',
  inside_scoring: 'Inside',
  passing: 'Pass',
  ball_handling: 'Handle',
  perimeter_defense: 'Perim D',
  post_defense: 'Post D',
  rebounding: 'Reb',
  speed: 'Speed',
  strength: 'Str',
};

const ProspectsTab: React.FC<ProspectsTabProps> = ({ savedGameId }) => {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [positionFilter, setPositionFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('overall_rating');
  const [selected, setSelected] = useState<Prospect | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await leagueAPI.getProspects(savedGameId);
        if (!cancelled) setProspects(data || []);
      } catch (err) {
        console.error('Failed to load prospects:', err);
        if (!cancelled) setError('Failed to load draft prospects.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [savedGameId]);

  const filtered = useMemo(() => {
    let list = [...prospects];
    if (positionFilter !== 'ALL') {
      list = list.filter(p => p.position === positionFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.college || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'age') return (a.age || 0) - (b.age || 0);
      const av = (a as any)[sortBy] || 0;
      const bv = (b as any)[sortBy] || 0;
      return bv - av;
    });
    return list;
  }, [prospects, positionFilter, search, sortBy]);

  const draftClassYear = prospects[0]?.draft_class_year;

  return (
    <div className="prospects-panel glass-panel animated-border-glow">
      <div className="prospects-header">
        <div className="panel-badge neon-amber prospects-class-badge">
          <GraduationCap size={14} strokeWidth={2.5} />
          {draftClassYear ? `${draftClassYear} DRAFT CLASS` : 'DRAFT PROSPECTS'}
        </div>
        <h2 className="panel-title">Scouting Board</h2>
        <p className="panel-subtitle">
          Evaluate incoming talent — measurables, college production, and projected draft range.
        </p>
      </div>

      {/* ── Controls ── */}
      <div className="prospects-controls">
        <div className="prospects-search">
          <Search size={16} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search name or college..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="prospects-position-filters">
          <button
            className={`pos-chip ${positionFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setPositionFilter('ALL')}
          >
            ALL
          </button>
          {POSITIONS.map(pos => (
            <button
              key={pos}
              className={`pos-chip ${positionFilter === pos ? 'active' : ''}`}
              onClick={() => setPositionFilter(pos)}
            >
              {pos}
            </button>
          ))}
        </div>

        <div className="prospects-sort">
          <label>Sort</label>
          <div className="select-wrap">
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={14} strokeWidth={2} />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      {loading && (
        <div className="prospects-loading">
          <div className="pulse-ring-loader" />
          <p>Loading scouting reports...</p>
        </div>
      )}

      {!loading && error && (
        <div className="glass-banner">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="prospects-empty">
          <AlertTriangle size={28} strokeWidth={1.5} />
          <p>No prospects match your filters.</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="prospects-count">{filtered.length} prospects</div>
          <div className="prospects-grid">
            {filtered.map(p => {
              const tier = tierFromRange(p.projected_draft_range);
              const trend = p.development_trend;
              return (
                <div
                  key={p.id}
                  className="prospect-card"
                  onClick={() => setSelected(p)}
                >
                  <div className="prospect-card-top">
                    <span className={`tier-tag ${tier.className}`}>{tier.label}</span>
                    <span className="prospect-position-badge">{p.position}</span>
                  </div>

                  <h3 className="prospect-name">
                    {p.first_name} {p.last_name}
                  </h3>
                  <p className="prospect-meta">
                    {p.college} · {p.college_class} · Age {p.age}
                  </p>

                  <div className="prospect-ratings-row">
                    <div className="prospect-rating-block">
                      <span className="rating-label">OVR</span>
                      <span className={`rating-value ${ratingClass(p.overall_rating)}`}>
                        {p.overall_rating}
                      </span>
                    </div>
                    <div className="prospect-rating-block">
                      <span className="rating-label">POT</span>
                      <span className={`rating-value ${ratingClass(p.potential_rating)}`}>
                        {p.potential_rating}
                      </span>
                    </div>
                    <div className="prospect-rating-block">
                      <span className="rating-label">HT</span>
                      <span className="rating-value stat-neutral">{heightLabel(p.height)}</span>
                    </div>
                  </div>

                  <div className="prospect-college-stats">
                    <span>{p.college_ppg?.toFixed(1)} PPG</span>
                    <span>{p.college_rpg?.toFixed(1)} RPG</span>
                    <span>{p.college_apg?.toFixed(1)} APG</span>
                  </div>

                  <div className="prospect-card-footer">
                    <span className="archetype-pill">{p.player_archetype}</span>
                    {trend === 'Rising' && <TrendingUp size={14} className="trend-up" />}
                    {trend === 'Falling' && <TrendingDown size={14} className="trend-down" />}
                    {trend === 'Stable' && <Minus size={14} className="trend-flat" />}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Detail modal ── */}
      {selected && (
        <div className="glass-modal-backdrop blur-bg" onClick={() => setSelected(null)}>
          <div className="glass-modal-container prospect-modal" onClick={e => e.stopPropagation()}>
            <div className="prospect-modal-header">
              <div>
                <div className="panel-badge neon-amber">
                  {tierFromRange(selected.projected_draft_range).label} · {selected.position}
                </div>
                <h2>{selected.first_name} {selected.last_name}</h2>
                <p className="panel-subtitle" style={{ margin: 0 }}>
                  {selected.college} ({selected.college_class}) · {selected.hometown_city}, {selected.hometown_state}
                </p>
              </div>
              <button className="close-drawer" onClick={() => setSelected(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="prospect-modal-body">
              {/* Core ratings */}
              <section className="modal-section">
                <h4><Star size={14} /> Core Ratings</h4>
                <div className="modal-rating-grid">
                  <div className="modal-rating-box">
                    <span className="rating-label">Overall</span>
                    <span className={`rating-value large ${ratingClass(selected.overall_rating)}`}>
                      {selected.overall_rating}
                    </span>
                  </div>
                  <div className="modal-rating-box">
                    <span className="rating-label">Potential</span>
                    <span className={`rating-value large ${ratingClass(selected.potential_rating)}`}>
                      {selected.potential_rating}
                    </span>
                  </div>
                  <div className="modal-rating-box">
                    <span className="rating-label">Breakout</span>
                    <span className="rating-value large stat-neutral">{selected.breakout_potential}</span>
                  </div>
                </div>
              </section>

              {/* Skill traits */}
              <section className="modal-section">
                <h4><Target size={14} /> Skill Profile</h4>
                <div className="trait-bar-list">
                  {Object.entries(selected.traits || {}).map(([key, val]) => (
                    <div key={key} className="trait-bar-row">
                      <span className="trait-bar-label">{TRAIT_LABELS[key] || key}</span>
                      <div className="trait-bar-track">
                        <div
                          className={`trait-bar-fill ${ratingClass(val)}`}
                          style={{ width: `${Math.min(100, val)}%` }}
                        />
                      </div>
                      <span className="trait-bar-value">{val}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* College production */}
              <section className="modal-section">
                <h4><GraduationCap size={14} /> College Production</h4>
                <div className="modal-stat-grid">
                  <div className="modal-stat"><span>{selected.college_ppg?.toFixed(1)}</span><label>PPG</label></div>
                  <div className="modal-stat"><span>{selected.college_rpg?.toFixed(1)}</span><label>RPG</label></div>
                  <div className="modal-stat"><span>{selected.college_apg?.toFixed(1)}</span><label>APG</label></div>
                  <div className="modal-stat"><span>{selected.college_spg?.toFixed(1)}</span><label>SPG</label></div>
                  <div className="modal-stat"><span>{selected.college_bpg?.toFixed(1)}</span><label>BPG</label></div>
                  <div className="modal-stat"><span>{selected.college_fg_pct?.toFixed(1)}%</span><label>FG%</label></div>
                  <div className="modal-stat"><span>{selected.college_three_pct?.toFixed(1)}%</span><label>3P%</label></div>
                  <div className="modal-stat"><span>{selected.college_ft_pct?.toFixed(1)}%</span><label>FT%</label></div>
                </div>
              </section>

              {/* Measurables */}
              <section className="modal-section">
                <h4><Ruler size={14} /> Measurables</h4>
                <div className="modal-stat-grid">
                  <div className="modal-stat"><span>{heightLabel(selected.height)}</span><label>Height</label></div>
                  <div className="modal-stat"><span>{selected.weight} lb</span><label>Weight</label></div>
                  <div className="modal-stat"><span>{heightLabel(selected.wingspan)}</span><label>Wingspan</label></div>
                  <div className="modal-stat"><span>{selected.standing_reach}"</span><label>Reach</label></div>
                  <div className="modal-stat"><span>{selected.max_vertical}"</span><label>Max Vert</label></div>
                  <div className="modal-stat"><span>{selected.lane_agility_time}s</span><label>Agility</label></div>
                  <div className="modal-stat"><span>{selected.three_quarter_sprint}s</span><label>3/4 Sprint</label></div>
                  <div className="modal-stat"><span>{selected.bench_press_reps}</span><label>Bench Reps</label></div>
                </div>
              </section>

              {/* Intangibles */}
              <section className="modal-section">
                <h4><Shield size={14} /> Intangibles</h4>
                <div className="intangibles-row">
                  <span className="intangible-pill">Work Ethic: {selected.work_ethic}</span>
                  <span className="intangible-pill">BBIQ: {selected.basketball_iq}</span>
                  <span className="intangible-pill">Leadership: {selected.leadership}</span>
                  <span className="intangible-pill">Injuries: {selected.injury_history}</span>
                  {selected.character_concerns && (
                    <span className="intangible-pill warning">
                      <AlertTriangle size={12} /> Character Concerns
                    </span>
                  )}
                </div>
              </section>

              {/* Comparisons */}
              {(selected.player_comparison_1 || selected.player_comparison_2) && (
                <section className="modal-section">
                  <h4><Zap size={14} /> NBA Comparisons</h4>
                  <div className="comp-row">
                    {selected.player_comparison_1 && <span className="archetype-pill">{selected.player_comparison_1}</span>}
                    {selected.player_comparison_2 && <span className="archetype-pill">{selected.player_comparison_2}</span>}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProspectsTab;