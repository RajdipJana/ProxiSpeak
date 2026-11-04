
import { useContext, useState, useEffect, useRef } from "react";

import "./Header.css";
import ProfileDropdown from "./ProfileDropdown";
import AppStatusContext from "../AppStatusContext";

function Header({
  user,
  onNavigate,
  onLogout,
  currentPage,
  currentRoom: currentRoomProp,
  onRequestRoomChange: onRequestRoomChangeProp,
}) {
  const {
    connected,
    employees = [],
    nearbyEmployees = [],
    voiceRange = 120,

    currentRoom: contextRoom = "workspace",
    onRequestRoomChange: contextRequestRoomChange,

    voiceJoined = false,
    muted = false,
    voiceError = "",
    audioConnections = 0,
    voiceDisabled = false,

    onJoinVoice,
    onToggleMute,
    onLeaveVoice,
  } = useContext(AppStatusContext);

  const currentRoom = currentRoomProp || contextRoom;

  const onRequestRoomChange =
    onRequestRoomChangeProp || contextRequestRoomChange;

  const [roomsOpen, setRoomsOpen] = useState(false);
  const roomsDropdownRef = useRef(null);

  const nearestEmployee =
    nearbyEmployees.length > 0
      ? [...nearbyEmployees].sort(
          (a, b) => a.distance - b.distance
        )[0]
      : null;

  const roomItems = [
    {
      label: "Conference Room",
      roomId: "conference",
    },
    {
      label: "Meeting Room 01",
      roomId: "meeting1",
    },
    {
      label: "Meeting Room 02",
      roomId: "meeting2",
    },
  ];

  // Close the Rooms dropdown when clicking outside.
  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        roomsDropdownRef.current &&
        !roomsDropdownRef.current.contains(event.target)
      ) {
        setRoomsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  // Handle room selection.
  function handleRoomSelection(roomId) {
    setRoomsOpen(false);

    // If already in this room, simply return to the Virtual Office.
    // Do not request another room transition or disconnect voice.
    if (roomId === currentRoom) {
      if (currentPage !== "VirtualOffice") {
        onNavigate("VirtualOffice");
      }

      return;
    }

    // Different room: request confirmation through App.jsx.
    if (onRequestRoomChange) {
      onRequestRoomChange(roomId);
    } else {
      console.error(
        "Room navigation handler is not connected yet."
      );
    }
  }

  const navItems = [
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

        <div className="header-center">
          <nav className="header-nav">
            {/* WORKSPACE DIRECT NAVIGATION */}
            <button
              type="button"
              className={`nav-link ${
                currentPage === "VirtualOffice" &&
                currentRoom === "workspace"
                  ? "active"
                  : ""
              }`}
              onClick={() => handleRoomSelection("workspace")}
              aria-current={
                currentPage === "VirtualOffice" &&
                currentRoom === "workspace"
                  ? "page"
                  : undefined
              }
            >
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M3 10.5 12 3l9 7.5" />
                  <path d="M5 9.5V21h14V9.5" />
                  <path d="M9 21v-7h6v7" />
                </svg>
              </span>

              <span className="nav-label">Workspace</span>
            </button>

            {/* ROOMS DROPDOWN */}
            <div
              className="rooms-nav-container"
              ref={roomsDropdownRef}
            >
              <button
                type="button"
                className={`nav-link rooms-dropdown-trigger ${
                  currentRoom !== "workspace" &&
                  currentPage === "VirtualOffice"
                    ? "active"
                    : ""
                }`}
                onClick={() => setRoomsOpen((previous) => !previous)}
                aria-expanded={roomsOpen}
                aria-haspopup="true"
              >
                <span className="nav-icon">
                  <svg viewBox="0 0 24 24">
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="16"
                      rx="2"
                    />
                    <path d="M9 4v16M15 4v16M3 10h18" />
                  </svg>
                </span>

                <span className="nav-label">Rooms</span>

                <svg
                  className={`rooms-chevron ${
                    roomsOpen ? "open" : ""
                  }`}
                  viewBox="0 0 24 24"
                >
                  <path d="m7 10 5 5 5-5" />
                </svg>
              </button>

              {roomsOpen && (
                <div className="rooms-dropdown-menu">
                  <div className="rooms-dropdown-heading">
                    AVAILABLE ROOMS
                  </div>

                  {roomItems.map((room) => (
                    <button
                      key={room.roomId}
                      type="button"
                      className={`rooms-dropdown-item ${
                        currentRoom === room.roomId
                          ? "selected"
                          : ""
                      }`}
                      onClick={() =>
                        handleRoomSelection(room.roomId)
                      }
                    >
                      <span className="rooms-item-icon">
                        <svg viewBox="0 0 24 24">
                          <rect
                            x="4"
                            y="3"
                            width="16"
                            height="18"
                            rx="2"
                          />
                          <path d="M9 3v18M15 3v18" />
                        </svg>
                      </span>

                      <span>{room.label}</span>

                      {currentRoom === room.roomId && (
                        <span className="rooms-current-indicator">
                          Current
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* REMAINING NAVIGATION */}
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

          {/* GLOBAL VOICE CONTROLS */}
          <div className="header-voice">
            {!voiceJoined ? (
              <button
                type="button"
                className="voice-action-button join-voice-button"
                onClick={onJoinVoice}
                disabled={voiceDisabled}
              >
                <span>🎙️</span>
                Join Voice
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="voice-action-button mute-voice-button"
                  onClick={onToggleMute}
                >
                  {muted ? "🔇 Unmute" : "🎙️ Mute"}
                </button>

                <button
                  type="button"
                  className="voice-action-button leave-voice-button"
                  onClick={onLeaveVoice}
                >
                  Leave
                </button>
              </>
            )}

            <div className="voice-status-info">
              <span
                className={`voice-status-dot ${
                  voiceJoined ? "voice-active" : ""
                }`}
              />

              <span className="voice-status-text">
                {voiceJoined
                  ? muted
                    ? "Microphone muted"
                    : "In voice chat"
                  : "Not in voice chat"}
              </span>

              <span className="voice-connection-count">
                Audio: {audioConnections}
              </span>
            </div>

            {voiceError && (
              <div className="header-voice-error" role="alert">
                {voiceError}
              </div>
            )}
          </div>
        </div>

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
