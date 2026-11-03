import Header from "../components/Header";
import "./Settings.css";

function Settings({ user, onNavigate, onLogout }) {
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
            <span className="settings-eyebrow">PREFERENCES & CONFIGURATION</span>
            <h1>Settings</h1>
            <p>
              Manage your ProxiSpeak account and customize your workspace
              experience.
            </p>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-card">
            <div className="settings-card-icon profile-icon">
              <span>👤</span>
            </div>

            <div className="settings-card-content">
              <div className="settings-card-title">
                <h3>Account Settings</h3>
                <span className="settings-status available">Available</span>
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

          <div className="settings-card">
            <div className="settings-card-icon audio-icon">
              <span>🎧</span>
            </div>

            <div className="settings-card-content">
              <div className="settings-card-title">
                <h3>Audio & Advanced Preferences</h3>
                <span className="settings-status upcoming">Coming Soon</span>
              </div>

              <p>
                We're working on additional controls to make your virtual
                office experience even better.
              </p>

              <ul>
                <li>Microphone and speaker preferences</li>
                <li>Audio configuration and controls</li>
                <li>Notification and workspace preferences</li>
              </ul>

              <div className="settings-upcoming-note">
                <span>✦</span>
                Advanced settings will be available in a future update.
              </div>
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