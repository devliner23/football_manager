// src/components/SelectedGame/tabs/CoachTab.tsx
import React, { useEffect, useState } from 'react';
import { leagueAPI, Coach, Team } from '../../../api/leagueApi';
import { ShieldCheck, Brain, Flame, ClipboardList, Repeat, Target } from 'lucide-react';
import './styles/CoachTab.css';

interface CoachTabProps {
  savedGameId: string;
  teamId?: string;
  team?: Team;
}

const ATTRIBUTE_LABELS: { key: keyof Coach['attributes']; label: string }[] = [
  { key: 'offense_rating',     label: 'Offense' },
  { key: 'defense_rating',     label: 'Defense' },
  { key: 'player_development', label: 'Player Development' },
  { key: 'motivation',         label: 'Motivation' },
  { key: 'discipline',         label: 'Discipline' },
  { key: 'adaptability',       label: 'Adaptability' },
  { key: 'rotation_iq',        label: 'Rotation IQ' },
  { key: 'clutch_factor',      label: 'Clutch Factor' },
];

const ARCHETYPE_LABELS: Record<string, string> = {
  '3-and-D': '3&D Specialists',
  'post-heavy': 'Post Heavy',
  'small-ball': 'Small Ball',
  'defensive-minded': 'Defensive Minded',
  'run-and-gun': 'Run & Gun',
  'inside-out': 'Inside-Out',
  'youth-movement': 'Youth Movement',
  'veteran-leadership': 'Veteran Leadership',
  'pace-and-space': 'Pace & Space',
  'grit-and-grind': 'Grit & Grind',
  'positionless': 'Positionless Basketball',
};

const CoachTab: React.FC<CoachTabProps> = ({ savedGameId, teamId, team }) => {
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    leagueAPI
      .getCoach(savedGameId, teamId)
      .then((data) => {
        if (!cancelled) setCoach(data);
      })
      .catch((err) => {
        console.error('Failed to load coach:', err);
        if (!cancelled) setError('Could not load coaching staff.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [savedGameId, teamId]);

  const initials = coach?.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tierFor = (value: number) =>
    value >= 85 ? 'elite' : value >= 72 ? 'strong' : value >= 60 ? 'average' : 'weak';

  // Placeholder actions — not yet wired to any backend logic.
  const handlePlaceholderAction = (actionName: string) => {
    console.log(`[CoachTab] "${actionName}" clicked — not implemented yet.`);
  };

  if (!teamId) {
    return (
      <div className="glass-panel coach-tab">
        <p className="panel-subtitle">No managed team found yet.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-panel coach-tab coach-tab-loading">
        <div className="pulse-ring-loader" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel coach-tab">
        <div className="glass-banner">{error}</div>
      </div>
    );
  }

  if (!coach) {
    return (
      <div className="glass-panel coach-tab">
        <p className="panel-subtitle">No coach is currently assigned to this team.</p>
      </div>
    );
  }

  return (
    <div className="coach-tab">
      {/* ── Coach identity card ── */}
      <div className="glass-panel coach-header-card">
        <div className="coach-header-card-first-row">
            <div className="coach-avatar-ring">
              <div className="coach-avatar">{initials}</div>
            </div>
            <div>
                <span className="panel-badge neon-blue-badge">HEAD COACH</span>
                <h2 className="panel-title">{coach.full_name}</h2>
            </div>
        </div>
        <p className="panel-subtitle">
          {team ? `${team.city} ${team.name}` : 'Unassigned'} · Age {coach.age} · Overall{' '}
          {coach.overall_rating}
        </p>

        <div className="coach-meta-row">
          <div className="meta-item">
            <span className="meta-label">Preferred Scheme</span>
            <span className="meta-value text-white">
              {ARCHETYPE_LABELS[coach.preferred_archetype] || coach.preferred_archetype}
            </span>
          </div>
          <div className="meta-item">
            <span className={`meta-value text-white coach-rating-pill tier-${tierFor(coach.overall_rating)}`}>
              {coach.overall_rating}
            </span>
            <span className="meta-label">Overall Rating</span>
          </div>
        </div>
      </div>

      {/* ── Attribute breakdown ── */}
      <div className="glass-panel coach-attributes-card">
        <h3 className="coach-section-title">
          <Brain size={16} /> Attributes
        </h3>
        <div className="coach-attribute-grid">
          {ATTRIBUTE_LABELS.map(({ key, label }) => {
            const value = coach.attributes?.[key] ?? 0;
            return (
              <div className={`coach-attribute-row tier-${tierFor(value)}`} key={key}>
                <span className="coach-attribute-label">{label}</span>
                <div className="coach-attribute-bar-track">
                  <div
                    className="coach-attribute-bar-fill"
                    style={{ width: `${Math.min(100, value)}%` }}
                  />
                </div>
                <span className="coach-attribute-value">{value}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Placeholder action sections ── */}
      <div className="glass-panel coach-actions-card">
        <h3 className="coach-section-title">
          <ClipboardList size={16} /> Coaching Staff Actions
        </h3>
        <p className="panel-subtitle" style={{ marginBottom: 20 }}>
          These actions are placeholders for now — hook them up as coaching mechanics come online.
        </p>
        <div className="coach-actions-grid">
          <button
            className="glass-btn btn-primary-blue-glow"
            onClick={() => handlePlaceholderAction('Extend Contract')}
          >
            <Repeat size={16} /> Extend Contract
          </button>
          <button
            className="glass-btn btn-primary-blue-glow"
            onClick={() => handlePlaceholderAction('Adjust Game Plan')}
          >
            <Target size={16} /> Adjust Game Plan
          </button>
          <button
            className="glass-btn btn-primary-blue-glow"
            onClick={() => handlePlaceholderAction('Review Development Focus')}
          >
            <ShieldCheck size={16} /> Development Focus
          </button>
          <button
            className="glass-btn btn-secondary-danger"
            onClick={() => handlePlaceholderAction('Fire Coach')}
          >
            <Flame size={16} /> Fire Coach
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoachTab;