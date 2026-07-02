import React from 'react';
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  Repeat,
  UserPlus,
  Building2,
  Calendar,
  X,
} from 'lucide-react';
import './styles/TutorialModal.css';

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
}

interface TutorialTab {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const tabs: TutorialTab[] = [
  {
    icon: <LayoutDashboard size={28} strokeWidth={1.5} />,
    title: 'Overview',
    description: 'Team summary, recent games, and quick actions.',
  },
  {
    icon: <Users size={28} strokeWidth={1.5} />,
    title: 'Roster',
    description: 'Manage your players, lineups, and rotations.',
  },
  {
    icon: <TrendingUp size={28} strokeWidth={1.5} />,
    title: 'Standings',
    description: 'Conference and division rankings across the league.',
  },
  {
    icon: <Repeat size={28} strokeWidth={1.5} />,
    title: 'Trade',
    description: 'Propose and review trades with other franchises.',
  },
  {
    icon: <UserPlus size={28} strokeWidth={1.5} />,
    title: 'Free Agents',
    description: 'Browse and sign available players.',
  },
  {
    icon: <Building2 size={28} strokeWidth={1.5} />,
    title: 'Front Office',
    description: 'Finances, staff, and long‑term strategy.',
  },
  {
    icon: <Calendar size={28} strokeWidth={1.5} />,
    title: 'Schedule',
    description: 'View upcoming games and simulate to a specific date.',
  },
];

const TutorialModal: React.FC<TutorialModalProps> = ({ visible, onClose }) => {
  if (!visible) return null;

  return (
    <div className="tutorial-overlay" onClick={onClose}>
      <div className="tutorial-glass" onClick={(e) => e.stopPropagation()}>
        <button className="tutorial-close" onClick={onClose}>
          <X size={24} />
        </button>
        <h2 className="tutorial-title">How to Run Your League</h2>
        <p className="tutorial-subtitle">
          These are the main sections you’ll use to manage your franchise.
        </p>
        <div className="tutorial-grid">
          {tabs.map((tab, index) => (
            <div key={index} className="tutorial-card">
              <div className="tutorial-icon">{tab.icon}</div>
              <h3 className="tutorial-card-title">{tab.title}</h3>
              <p className="tutorial-card-desc">{tab.description}</p>
            </div>
          ))}
        </div>
        <button className="tutorial-got-it" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
};

export default TutorialModal;