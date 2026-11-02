import { useContext } from "react";
import "./Header.css";
import ProfileDropdown from "./ProfileDropdown";
import AppStatusContext from "../AppStatusContext";

function Header({
  user,
  onNavigate,
  onLogout,
  currentPage,
}) {
  const {
    connected,
    employees,
    nearbyEmployees,
    voiceRange,
  } = useContext(AppStatusContext);

  const nearestEmployee =
    nearbyEmployees.length > 0
      ? [...nearbyEmployees].sort(
          (a, b) => a.distance - b.distance
        )[0]
      : null;

  const navItems = [
    {
      label: "Office",
      page: "VirtualOffice",
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9 21v-7h6v7" />
        </svg>
      ),
    },
    {
      label: "People",
      page: "People",
      icon: (
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2" />
          <path d="M16 4.8a3.5 3.5 0 0 1 0 6.5" />
          <path d="M18 15a5.5 5.5 0 0 1 3.5 5" />
        </svg>
      ),
    },
    {
      label: "My Team",
      page: "MyTeam",
      icon: (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="7" r="3" />
          <circle cx="5" cy="10" r="2.5" />
          <circle cx="19" cy="10" r="2.5" />
          <path d="M6 21v-2a6 6 0 0 1 12 0v2" />
          <path d="M1 20v-1a4 4 0 0 1 4-4" />
          <path d="M23 20v-1a4 4 0 0 0-4-4" />
        </svg>
      ),
    },
    {
      label: "Meetings",
      page: "Meetings",
      icon: (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
          <path d="M8 15h2M14 15h2M8 18h2" />
        </svg>
      ),
    },
    {
      label: "Chat",
      page: "Chat",
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8z" />
          <path d="M8 12h.01M12 12h.01M16 12h.01" />
        </svg>
      ),
    },
  ];

  return (
    <header className="app-header">
      <div className="header-main">

        <div className="header-brand">
          <div className="header-logo">P</div>

          <div className="header-brand-text">
            <h2>ProxiSpeak</h2>

            <div className="header-subtitle">
              <span className="live-dot"></span>
              <b>Virtual Workspace</b>
            </div>
          </div>
        </div>

        <nav className="header-nav">
          {navItems.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`nav-link ${
                currentPage === item.page ? "active" : ""
              }`}
              onClick={() => onNavigate(item.page)}
              aria-current={
                currentPage === item.page ? "page" : undefined
              }
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="header-profile">
          <ProfileDropdown
            user={user}
            onNavigate={onNavigate}
            onLogout={onLogout}
          />
        </div>
      </div>

      {/* GLOBAL LIVE STATUS */}
      <div className="header-status">

        <div className="status-item">
          <span
            className={`status-indicator ${
              connected ? "online" : "offline"
            }`}
          />
          <span className="status-label">
            {connected ? "Connected" : "Connecting..."}
          </span>
        </div>

        <div className="status-divider" />

        <div className="status-item">
          <span className="status-icon">👥</span>
          <span>Employees online</span>
          <strong>{employees.length}</strong>
        </div>

        <div className="status-divider" />

        <div className="status-item">
          <span className="status-icon">📍</span>
          <span>Nearby</span>
          <strong>{nearbyEmployees.length}</strong>
        </div>

        {/* <div className="status-divider" /> */}

        <div className="status-item nearest-status">
          <span className="status-icon">-</span>
          <span className="nearest-label">
            {nearestEmployee
              ? `${nearestEmployee.name} (${nearestEmployee.distance}px)`
              : "No nearby employees"}
          </span>
        </div>

        <div className="status-divider" />

        <div className="status-item">
          <span className="status-icon">🔊</span>
          <span>Voice range</span>
          <strong>{voiceRange}px</strong>
        </div>

        <div className="status-divider" />

        <div className="status-item movement-status">
          <span className="status-icon">⌨</span>
          <span>Move:</span>
          <div className="keyboard-keys">
            <kbd>W</kbd>
            <kbd>A</kbd>
            <kbd>S</kbd>
            <kbd>D</kbd>
          </div>
          <span className="or-label">or</span>
          <span className="arrow-keys">↑ ↓ ← →</span>
        </div>

      </div>
    </header>
  );
}

export default Header;