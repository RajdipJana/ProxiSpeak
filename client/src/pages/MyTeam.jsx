
import Header from "../components/Header";
import "./MyTeam.css";

const DEMO_TEAMS = {
  "TEAM-ALPHA": {
    name: "Team Alpha",
    id: "TEAM-ALPHA",
    members: [
      { name: "Dona Mondal", employeeId: "PS-001", role: "Team Member" },
      { name: "Rajdip Jana", employeeId: "PS-002", role: "Team Member" },
    ],
  },
  "TEAM-BETA": {
    name: "Team Beta",
    id: "TEAM-BETA",
    members: [
      { name: "Rithvik Kolipaka", employeeId: "PS-003", role: "Team Member" },
      { name: "Abdul Muhyee", employeeId: "PS-004", role: "Team Member" },
    ],
  },
};

function MyTeam({ user, onNavigate, onLogout }) {
  const teamId = user?.teamId?.toUpperCase();
  const team = DEMO_TEAMS[teamId];

  const isAssigned = Boolean(team);

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

        {/* TEAM ASSIGNMENT */}
        {isAssigned ? (
          <>
            <section className="myteam-team-card">
              <div className="myteam-team-top">
                <div>
                  <span className="myteam-info-tag">
                    OFFICIAL TEAM ASSIGNMENT
                  </span>

                  <h2>{team.name}</h2>

                  <p className="myteam-team-id">
                    Team ID: <strong>{team.id}</strong>
                  </p>
                </div>

                <div className="myteam-team-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="9" cy="8" r="3" />
                    <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
                    <path d="M16 5a3 3 0 0 1 0 6" />
                    <path d="M18 14a5 5 0 0 1 3 5v1" />
                  </svg>
                </div>
              </div>

              <div className="myteam-team-stats">
                <div className="myteam-stat">
                  <span className="myteam-stat-number">
                    {team.members.length}
                  </span>
                  <span className="myteam-stat-label">
                    Team Members
                  </span>
                </div>

                <div className="myteam-stat-divider"></div>

                <div className="myteam-stat">
                  <span className="myteam-stat-number">
                    {team.id}
                  </span>
                  <span className="myteam-stat-label">
                    Organization Team ID
                  </span>
                </div>
              </div>
            </section>

            {/* TEAM MEMBERS */}
            <section className="myteam-members-section">
              <div className="myteam-section-heading">
                <div>
                  <h2>Team Members</h2>
                  <p>
                    Employees officially assigned to {team.name}.
                  </p>
                </div>

                <span className="myteam-member-count">
                  {team.members.length} Members
                </span>
              </div>

              <div className="myteam-members-grid">
                {team.members.map((member) => {
                  const isCurrentUser =
                    member.employeeId === user?.employeeId;

                  return (
                    <div
                      className={`myteam-member-card ${
                        isCurrentUser ? "current-user-card" : ""
                      }`}
                      key={member.employeeId}
                    >
                      <div className="myteam-member-avatar">
                        {member.name.charAt(0).toUpperCase()}
                      </div>

                      <div className="myteam-member-details">
                        <div className="myteam-member-name-row">
                          <h3>{member.name}</h3>

                          {isCurrentUser && (
                            <span className="myteam-you-badge">
                              YOU
                            </span>
                          )}
                        </div>

                        <p>{member.employeeId}</p>
                        <span className="myteam-member-role">
                          {member.role}
                        </span>
                      </div>

                      <div className="myteam-member-indicator">
                        <span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          /* UNASSIGNED STATE */
          <section className="myteam-unassigned-card">
            <div className="myteam-unassigned-icon">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="9" cy="8" r="3" />
                <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
                <path d="M16 5a3 3 0 0 1 0 6" />
                <path d="M18 14a5 5 0 0 1 3 5v1" />
              </svg>
            </div>

            <span className="myteam-info-tag">
              TEAM NOT ASSIGNED
            </span>

            <h2>You haven't been assigned to a team yet.</h2>

            <p>
              Your team assignment will appear here once your company
              administrator assigns you to an official team.
            </p>
          </section>
        )}

        {/* COMPANY MANAGEMENT INFORMATION */}
        <section className="myteam-management-card">
          <div className="myteam-management-content">
            <span className="myteam-info-tag">
              COMPANY MANAGED
            </span>

            <h2>Team assignments are managed by your company.</h2>

            <p>
              Team assignments, membership changes, and organizational
              structures are maintained by authorized company
              administrators. Employees can view their assigned team
              information here.
            </p>

            <div className="myteam-divider"></div>

            <div className="myteam-notice">
              <div className="myteam-notice-icon">i</div>

              <div>
                <strong>Need a team assignment or update?</strong>
                <p>
                  Please contact your HR department or company
                  administrator for team allocation, transfers, or
                  membership changes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* POLICY SECTION */}
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
                Employees are assigned to teams through company
                administration.
              </p>
            </div>

            <div className="myteam-policy-item">
              <div className="policy-icon">♧</div>
              <h3>Centralized Management</h3>
              <p>
                Team membership and organizational changes are handled
                by authorized personnel.
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
