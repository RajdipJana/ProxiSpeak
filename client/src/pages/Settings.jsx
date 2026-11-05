
import Header from "../components/Header";
import "./Settings.css";

function Settings({
  user,
  onNavigate,
  onLogout,
  voiceRangePreference = 120,
  onVoiceRangeChange,
}) {
  const selectedRange = voiceRangePreference === 75 ? 75 : 120;

  return (
    <div className="settings-page">
      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="Settings"
      />

      <div className="settings-container">
        <div className="settings-heading">
          <div>
            <span className="settings-eyebrow">
              PREFERENCES & CONFIGURATION
            </span>
            <h1>Settings</h1>
            <p>
              Manage your ProxiSpeak account and customize your workspace
              experience.
            </p>
          </div>
        </div>

        <div className="settings-section">
          {/* Account Settings */}
          <div className="settings-card">
            <div className="settings-card-icon profile-icon">
              <span>👤</span>
            </div>

            <div className="settings-card-content">
              <div className="settings-card-title">
                <h3>Account Settings</h3>
                <span className="settings-status available">
                  Available
                </span>
              </div>

              <p>
                Your essential account settings are already available in your
                Profile section.
              </p>

              <ul>
                <li>Employee information</li>
                <li>Account details</li>
                <li>Password management</li>
              </ul>

              <button
                className="settings-action-button"
                onClick={() => onNavigate("Profile")}
              >
                Go to Profile <span>→</span>
              </button>
            </div>
          </div>

          {/* Audio Settings */}
          <div className="settings-card">
            <div className="settings-card-icon audio-icon">
              <span>🎧</span>
            </div>

            <div className="settings-card-content">
              <div className="settings-card-title">
                <h3>Workspace Voice Range</h3>
                <span className="settings-status available">
                  Available
                </span>
              </div>

              <p>
                Choose how far your voice can reach other employees in the
                Main Workspace.
              </p>

              <div className="voice-range-options">
                <button
                  type="button"
                  className={`voice-range-option ${
                    selectedRange === 75 ? "active" : ""
                  }`}
                  onClick={() => onVoiceRangeChange?.(75)}
                  aria-pressed={selectedRange === 75}
                >
                  <span className="range-option-icon">🔵</span>
                  <span className="range-option-details">
                    <strong>75px</strong>
                    <small>Close Range</small>
                  </span>
                  <span className="range-option-check">
                    {selectedRange === 75 ? "✓" : ""}
                  </span>
                </button>

                <button
                  type="button"
                  className={`voice-range-option ${
                    selectedRange === 120 ? "active" : ""
                  }`}
                  onClick={() => onVoiceRangeChange?.(120)}
                  aria-pressed={selectedRange === 120}
                >
                  <span className="range-option-icon">🌐</span>
                  <span className="range-option-details">
                    <strong>120px</strong>
                    <small>Extended Range</small>
                  </span>
                  <span className="range-option-check">
                    {selectedRange === 120 ? "✓" : ""}
                  </span>
                </button>
              </div>

              <div className="voice-range-info">
                <span>✦</span>
                <p>
                  {selectedRange === 75
                    ? "Your voice is limited to employees within 75px. Both employees must be within each other's selected range to communicate."
                    : "Full volume up to 75px, followed by gradual volume fading until 120px."}
                </p>
              </div>

              <p className="voice-range-footnote">
                This preference only affects the Main Workspace. Conference
                and meeting rooms always have unrestricted group audio.
              </p>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <span>⚙</span>
          <p>
            ProxiSpeak Settings · More customization options are on the way.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Settings;
