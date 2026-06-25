// src/components/SelectedGame/tabs/GameNavHeader.tsx
import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Settings, X } from 'lucide-react';
import './styles/GameNavHeader.css';

type TabType = 'overview' | 'roster' | 'standings' | 'trade' | 'freeagents' | 'frontoffice' | 'schedule';

interface RouteItem {
  label: string;
  tab: TabType;
  icon?: React.ReactNode;
}

interface GameNavHeaderProps {
  onBack: () => void;
  setActiveTab: (tab: TabType) => void;
  currentTab: TabType;
}

const routes: RouteItem[] = [
  { label: 'Overview', tab: 'overview' },
  { label: 'Roster', tab: 'roster' },
  { label: 'Standings', tab: 'standings' },
  { label: 'Trade', tab: 'trade' },
  { label: 'Free Agents', tab: 'freeagents' },
  { label: 'Front Office', tab: 'frontoffice' },
  { label: 'Schedule', tab: 'schedule' },
];

const GameNavHeader: React.FC<GameNavHeaderProps> = ({
  onBack,
  setActiveTab,
  currentTab,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setModalOpen(false);
      }
    };
    if (modalOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modalOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    if (modalOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalOpen]);

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
    setModalOpen(false);
  };

  return (
    <>
      <header className="game-nav-header">
        <div className="nav-header-inner">
          <button className="nav-back-btn" onClick={onBack} aria-label="Back to dashboard">
            <ArrowLeft size={22} strokeWidth={2.5} />
            <span>Back</span>
          </button>

          <div className="nav-current-tab-label">
            {routes.find(r => r.tab === currentTab)?.label ?? 'Overview'}
          </div>

          <button
            className="nav-settings-btn"
            onClick={() => setModalOpen(true)}
            aria-label="Open navigation"
          >
            <Settings size={22} strokeWidth={2} />
          </button>
        </div>
      </header>

      {modalOpen && (
        <div className="nav-modal-overlay">
          <div className="nav-modal-glass" ref={modalRef}>
            <div className="nav-modal-header">
              <h3>Navigate</h3>
              <button className="nav-modal-close" onClick={() => setModalOpen(false)}>
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>
            <ul className="nav-route-list">
              {routes.map((route) => (
                <li key={route.tab} className={`nav-route-item ${route.tab === currentTab ? 'active' : ''}`}>
                  <button
                    className="nav-route-link"
                    onClick={() => handleTabClick(route.tab)}
                  >
                    {route.label}
                  </button>
                </li>
              ))}
            </ul>
            <div className="nav-modal-footer">
              <span className="nav-footer-hint">Press Esc to close</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GameNavHeader;