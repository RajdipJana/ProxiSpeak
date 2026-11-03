import { useState } from "react";
import "./Login.css";

const API_URL = "http://localhost:5000";

function Login({ onLogin }) {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">P</div>
          <h1>ProxiSpeak</h1>
          <p>Your virtual workspace</p>
        </div>

        <div className="login-heading">
          <h2>Welcome back</h2>
          <p>Sign in to enter your virtual office.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="employeeId">Employee ID</label>

          <input
            id="employeeId"
            type="text"
            placeholder="Enter your employee ID (e.g. PS-001)"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            autoComplete="username"
            required
          />

          <label htmlFor="password">Password</label>

          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="login-button"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing In..." : "Sign In"}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <div className="login-demo">
          <p>Demo Employee Accounts</p>

          <span>Dona Mondal: PS-001</span>
          <span>Rajdip Jana: PS-002</span>
          <span>Rithvik kolipaka: PS-003</span>
          <span>Abdul Muhyee: PS-004</span>

          <span>Password for all: 123456</span>
        </div>

        <p className="login-footer">
          ProxiSpeak · Virtual Office Demo
        </p>
      </div>
    </div>
  );
}

export default Login;