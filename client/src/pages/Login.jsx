import { useState } from "react";
import "./Login.css";

const API_URL = "http://localhost:5000";

function Login({ onLogin }) {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employeeId: employeeId.trim().toUpperCase(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Invalid employee ID or password.");
        return;
      }

      // Pass employee information and JWT token to App.jsx
      onLogin({
        ...data.user,
        token: data.token,
      });
    } catch (err) {
      console.error("Login error:", err);

      setError(
        "Unable to connect to the server. Please make sure ProxiSpeak's backend is running."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">

        {/* LEFT BRANDING PANEL */}
        <section className="login-showcase">
          <div className="showcase-top">
            <div className="showcase-brand">
              <div className="login-logo">P</div>
              <span>ProxiSpeak</span>
            </div>

            <span className="showcase-version">
              VIRTUAL WORKSPACE
            </span>
          </div>

          <div className="showcase-content">
            <div className="showcase-pill">
              <span className="status-dot"></span>
              YOUR TEAM, CONNECTED
            </div>

            <h1>
              Work together.
              <br />
              <span>Feel closer.</span>
            </h1>

            <p className="showcase-description">
              Step into your virtual office, connect with your teammates,
              and collaborate naturally from anywhere.
            </p>

            <div className="showcase-visual">
              <div className="visual-glow"></div>

              <div className="visual-orbit orbit-one"></div>
              <div className="visual-orbit orbit-two"></div>

              <div className="visual-center">
                <div className="visual-center-logo">P</div>
              </div>

              <div className="team-avatar avatar-one">
                D
                <span></span>
              </div>

              <div className="team-avatar avatar-two">
                R
                <span></span>
              </div>

              <div className="team-avatar avatar-three">
                A
                <span></span>
              </div>

              <div className="team-avatar avatar-four">
                J
                <span></span>
              </div>

              <div className="visual-caption">
                <span className="caption-indicator"></span>
                Your virtual office is waiting
              </div>
            </div>

            <div className="showcase-features">
              <div className="showcase-feature">
                <div className="feature-icon">◎</div>
                <div>
                  <strong>Virtual Office</strong>
                  <span>Meet your team in one place</span>
                </div>
              </div>

              <div className="showcase-feature">
                <div className="feature-icon">◉</div>
                <div>
                  <strong>Proximity Voice</strong>
                  <span>Talk naturally with nearby teammates</span>
                </div>
              </div>

              <div className="showcase-feature">
                <div className="feature-icon">↗</div>
                <div>
                  <strong>Real-time Connection</strong>
                  <span>Stay connected as your team works</span>
                </div>
              </div>
            </div>
          </div>

          <div className="showcase-footer">
            <span>© 2026 ProxiSpeak</span>
            <span>Built for better collaboration.</span>
          </div>
        </section>

        {/* RIGHT LOGIN PANEL */}
        <section className="login-panel">
          <div className="login-panel-content">

            <div className="mobile-brand">
              <div className="login-logo">P</div>
              <span>ProxiSpeak</span>
            </div>

            <div className="login-heading">
              <div className="login-welcome-tag">
                WELCOME BACK
              </div>

              <h2>Sign in to your account</h2>

              <p>
                Enter your employee credentials to access your workspace.
              </p>
            </div>

            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-field">
                <label htmlFor="employeeId">
                  Employee ID
                </label>

                <div className="login-input-wrapper">
                  <span className="input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
                    </svg>
                  </span>

                  <input
                    id="employeeId"
                    type="text"
                    placeholder="e.g. PS-001"
                    value={employeeId}
                    onChange={(event) =>
                      setEmployeeId(event.target.value)
                    }
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="password">
                  Password
                </label>

                <div className="login-input-wrapper">
                  <span className="input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <rect x="4" y="10" width="16" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>

                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    autoComplete="current-password"
                    required
                  />

                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() =>
                      setShowPassword((previous) => !previous)
                    }
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                        <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-3.1 3.8" />
                        <path d="M6.2 6.2C3.9 7.8 3 12 3 12s3.5 7 9 7a10 10 0 0 0 4-.8" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24">
                        <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="login-error" role="alert">
                  <span>!</span>
                  {error}
                </div>
              )}

              <button
                className="login-button"
                type="submit"
                disabled={loading}
              >
                <span>
                  {loading ? "Signing In..." : "Sign In to Workspace"}
                </span>

                {!loading && (
                  <span className="login-button-arrow">→</span>
                )}

                {loading && (
                  <span className="login-spinner"></span>
                )}
              </button>
            </form>

            {/* DEMO ACCOUNTS */}
            <div className="login-demo">
              <div className="demo-heading">
                <div>
                  <span className="demo-heading-icon">✦</span>
                  <strong>Demo Access</strong>
                </div>

                <span className="demo-label">TEST ACCOUNTS</span>
              </div>

              <p className="demo-description">
                Use any of the following employee accounts to explore
                ProxiSpeak.
              </p>

              <div className="demo-accounts">
                <div className="demo-account">
                  <span className="demo-avatar demo-dona">D</span>
                  <span className="demo-name">Dona Mondal</span>
                  <strong>PS-001</strong>
                </div>

                <div className="demo-account">
                  <span className="demo-avatar demo-rajdip">R</span>
                  <span className="demo-name">Rajdip Jana</span>
                  <strong>PS-002</strong>
                </div>

                <div className="demo-account">
                  <span className="demo-avatar demo-rithvik">R</span>
                  <span className="demo-name">Rithvik kolipaka</span>
                  <strong>PS-003</strong>
                </div>

                <div className="demo-account">
                  <span className="demo-avatar demo-abdul">A</span>
                  <span className="demo-name">Abdul Muhyee</span>
                  <strong>PS-004</strong>
                </div>
              </div>

              <div className="demo-password">
                <span>Password for all accounts</span>
                <strong>123456</strong>
              </div>
            </div>

            <div className="login-security">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>

              <span>Secure employee authentication</span>
            </div>

          </div>

          <div className="login-panel-footer">
            ProxiSpeak <span>·</span> Virtual Office Platform
          </div>
        </section>

      </div>
    </main>
  );
}

export default Login;