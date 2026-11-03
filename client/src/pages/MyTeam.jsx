import Header from "../components/Header";
import "./MyTeam.css";

function MyTeam({ user, onNavigate, onLogout }) {
  return (
    <main className="app myteam-page">
      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="MyTeam"
      />

      <div className="myteam-container">

        {/* PAGE HEADER */}
        <div className="myteam-header">
          <div>
            <p className="myteam-eyebrow">WORKSPACE DIRECTORY</p>
            <h1>My Team</h1>
            <p className="myteam-subtitle">
              Your official team information and organizational connections.
            </p>
          </div>
        </div>

        {/* EMPLOYEE INFORMATION */}
        <section className="myteam-welcome-card">
          <div className="myteam-welcome-content">
            <div className="myteam-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>

            <div>
              <span className="myteam-welcome-label">
                CURRENT EMPLOYEE
              </span>

              <h2>{user?.name || "Employee"}</h2>

              <p>
                {user?.employeeId || "Employee ID unavailable"}
                <span> · </span>
                {user?.department || "Department not assigned"}
              </p>
            </div>
          </div>

          <div className="myteam-status">
            <span className="myteam-status-dot"></span>
            Employee Account
          </div>
        </section>

        {/* TEAM ASSIGNMENT NOTICE */}
        <section className="myteam-management-card">
          <div className="myteam-illustration">
            <div className="myteam-illustration-circle">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="8" r="3" />
                <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
                <path d="M16 5a3 3 0 0 1 0 6" />
                <path d="M18 14a5 5 0 0 1 3 5v1" />
              </svg>
            </div>

            <div className="myteam-decoration decoration-one"></div>
            <div className="myteam-decoration decoration-two"></div>
          </div>

          <div className="myteam-management-content">
            <span className="myteam-info-tag">
              COMPANY MANAGED
            </span>

            <h2>Your team is managed by the company.</h2>

            <p>
              Team assignments and organizational structures are maintained
              by the company's authorized administration. This helps ensure
              accurate team information, clear reporting structures, and
              consistent collaboration across the organization.
            </p>

            <div className="myteam-divider"></div>

            <div className="myteam-notice">
              <div className="myteam-notice-icon">i</div>

              <div>
                <strong>Need a team assignment or update?</strong>
                <p>
                  Please contact your HR department or company administrator
                  for team allocation, transfers, or membership changes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* RESPONSIBILITY INFORMATION */}
        <section className="myteam-responsibilities">
          <div className="myteam-section-heading">
            <div>
              <h2>Team Management Policy</h2>
              <p>How team information is maintained in ProxiSpeak.</p>
            </div>
          </div>

          <div className="myteam-policy-grid">
            <div className="myteam-policy-item">
              <div className="policy-icon">⌂</div>
              <h3>Official Assignment</h3>
              <p>
                Employees are assigned to teams through the company's
                administration.
              </p>
            </div>

            <div className="myteam-policy-item">
              <div className="policy-icon">♧</div>
              <h3>Centralized Management</h3>
              <p>
                Team membership and organizational changes are handled by
                authorized personnel.
              </p>
            </div>

            <div className="myteam-policy-item">
              <div className="policy-icon">✓</div>
              <h3>Reliable Information</h3>
              <p>
                Official team details remain consistent across the
                organization's workspace.
              </p>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <div className="myteam-footer">
          <span>ProxiSpeak · Organization Workspace</span>
          <span>Team administration is controlled by your company.</span>
        </div>

      </div>
    </main>
  );
}

export default MyTeam;