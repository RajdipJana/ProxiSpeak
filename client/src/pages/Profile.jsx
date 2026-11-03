import { useState } from "react";
import Header from "../components/Header";
import "./Profile.css";

const API_URL = "http://localhost:5000";

function Profile({ user, onNavigate, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordChange(event) {
    event.preventDefault();

    setMessage("");
    setMessageType("");

    if (newPassword.length < 8) {
      setMessage("New password must contain at least 8 characters.");
      setMessageType("error");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("New password and confirm password do not match.");
      setMessageType("error");
      return;
    }

    if (currentPassword === newPassword) {
      setMessage("New password must be different from the current password.");
      setMessageType("error");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/auth/change-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        setMessage(data.message || "Unable to change password.");
        setMessageType("error");
        return;
      }

      setMessage("Password changed successfully!");
      setMessageType("success");

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Password change error:", error);

      setMessage("Unable to connect to the server. Please try again.");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="profile-page">

      {/* SHARED HEADER */}
      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="Profile"
      />

      <div className="profile-container">

        <div className="profile-header">
          <div>
            <p className="profile-eyebrow">ACCOUNT SETTINGS</p>
            <h1>My Profile</h1>
            <p className="profile-subtitle">
              Manage your employee information and account security.
            </p>
          </div>
        </div>

        <div className="profile-content">

          {/* EMPLOYEE INFORMATION */}
          <section className="profile-card">
            <div className="profile-card-heading">
              <div className="profile-icon">👤</div>
              <div>
                <h2>Personal Information</h2>
                <p>Your ProxiSpeak employee details</p>
              </div>
            </div>

            <div className="profile-user">
              <div className="profile-avatar">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>

              <div>
                <h3>{user?.name || "Employee"}</h3>
                <span className="profile-role">
                  {user?.role || "Employee"}
                </span>
              </div>
            </div>

            <div className="profile-details">
              <div className="profile-detail-item">
                <span>Employee Name</span>
                <strong>{user?.name || "Not available"}</strong>
              </div>

              <div className="profile-detail-item">
                <span>Employee ID</span>
                <strong>{user?.employeeId || "Not available"}</strong>
              </div>

              <div className="profile-detail-item">
                <span>Department</span>
                <strong>{user?.department || "Not available"}</strong>
              </div>

              <div className="profile-detail-item">
                <span>Account Role</span>
                <strong>{user?.role || "Employee"}</strong>
              </div>
            </div>
          </section>

          {/* CHANGE PASSWORD */}
          <section className="profile-card">
            <div className="profile-card-heading">
              <div className="profile-icon security-icon">🔐</div>
              <div>
                <h2>Change Password</h2>
                <p>Keep your account secure with a strong password.</p>
              </div>
            </div>

            <form
              className="password-form"
              onSubmit={handlePasswordChange}
            >
              <div className="password-field">
                <label htmlFor="currentPassword">
                  Current Password
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  placeholder="Enter your current password"
                  value={currentPassword}
                  onChange={(event) =>
                    setCurrentPassword(event.target.value)
                  }
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="password-field">
                <label htmlFor="newPassword">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  placeholder="Enter your new password"
                  value={newPassword}
                  onChange={(event) =>
                    setNewPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <small>Minimum 8 characters required.</small>
              </div>

              <div className="password-field">
                <label htmlFor="confirmPassword">
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your new password"
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              {message && (
                <div
                  className={`password-message ${messageType}`}
                  role="alert"
                >
                  {message}
                </div>
              )}

              <button
                className="password-submit-button"
                type="submit"
                disabled={loading}
              >
                {loading ? "Updating Password..." : "Update Password"}
              </button>
            </form>
          </section>

        </div>

        <p className="profile-footer">
          ProxiSpeak · Employee Account Management
        </p>

      </div>
    </div>
  );
}

export default Profile;