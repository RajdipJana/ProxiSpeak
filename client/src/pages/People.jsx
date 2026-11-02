
import { useState, useMemo } from "react";
import Header from "../components/Header";

function People({
  user,
  onNavigate,
  onLogout,
  onlineEmployees = [],
  connected = false,
}) {
  const [search, setSearch] = useState("");

  // Use the employee list maintained by App.jsx.
  const employees = onlineEmployees;

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return employees;

    return employees.filter((employee) =>
      [employee.name, employee.userId].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [employees, search]);

  return (
    <main className="app people-page">
      <style>{`
        .people-page {
          min-height: 100vh;
          background: #0b1220;
          color: #e8f1ff;
        }

        .people-container {
          max-width: 1250px;
          margin: 0 auto;
          padding: 30px 24px;
        }

        .people-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 28px;
        }

        .people-heading h1 {
          font-size: 28px;
          margin: 0 0 8px;
          color: #f1f7ff;
        }

        .people-heading p {
          color: #94a8c4;
          margin: 0;
          font-size: 14px;
        }

        .people-live-status {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(20, 184, 120, 0.10);
          border: 1px solid rgba(20, 184, 120, 0.25);
          border-radius: 30px;
          padding: 9px 15px;
          font-size: 13px;
          color: #65e6a6;
        }

        .people-live-dot {
          width: 8px;
          height: 8px;
          background: #22d38a;
          border-radius: 50%;
          box-shadow: 0 0 10px rgba(34, 211, 138, 0.7);
        }

        .people-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 16px;
          margin-bottom: 26px;
        }

        .people-stat-card {
          background: linear-gradient(135deg, #17253a, #111d30);
          border: 1px solid rgba(130, 170, 220, 0.12);
          border-radius: 14px;
          padding: 20px;
        }

        .people-stat-label {
          color: #91a5c2;
          font-size: 13px;
          margin-bottom: 12px;
        }

        .people-stat-value {
          color: #f2f7ff;
          font-size: 29px;
          font-weight: 700;
        }

        .people-search-area {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 14px;
          margin-bottom: 20px;
        }

        .people-search {
          width: 100%;
          max-width: 380px;
          padding: 13px 16px;
          border-radius: 10px;
          border: 1px solid #293b55;
          outline: none;
          background: #142238;
          color: white;
          font-size: 14px;
          box-sizing: border-box;
        }

        .people-search:focus {
          border-color: #20b8e8;
          box-shadow: 0 0 0 3px rgba(32, 184, 232, 0.10);
        }

        .people-search::placeholder {
          color: #7186a3;
        }

        .people-results {
          color: #91a5c2;
          font-size: 13px;
        }

        .people-grid {
          display: flex;
          flex-direction: column;
          gap: 13px;
        }

        .employee-card {
          display: grid;
          grid-template-columns: minmax(210px, 1.4fr) minmax(110px, 0.65fr) minmax(150px, 0.9fr) minmax(150px, 0.9fr) minmax(140px, 0.8fr);
          align-items: center;
          gap: 20px;
          position: relative;
          background: linear-gradient(110deg, #192a42, #111d30);
          border: 1px solid rgba(120, 165, 220, 0.14);
          border-radius: 14px;
          padding: 17px 22px;
          transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
        }

        .employee-card:hover {
          transform: translateX(3px);
          border-color: rgba(0, 190, 255, 0.45);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
        }

        .employee-card-top {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
        }

        .employee-avatar {
          width: 50px;
          height: 50px;
          flex-shrink: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          border-radius: 14px;
          background: linear-gradient(135deg, #087fae, #3152bd);
          color: white;
          font-size: 17px;
          font-weight: 700;
          box-shadow: 0 5px 18px rgba(0, 150, 255, 0.18);
        }

        .employee-name {
          font-size: 15px;
          font-weight: 650;
          color: #f1f6ff;
          margin-bottom: 6px;
          word-break: break-word;
        }

        .employee-id {
          color: #91a5c2;
          font-size: 12px;
          word-break: break-all;
        }

        .employee-presence {
          display: inline-flex;
          align-items: center;
          justify-self: start;
          gap: 7px;
          color: #60e6a0;
          font-size: 12px;
          background: rgba(30, 200, 125, 0.09);
          border-radius: 20px;
          padding: 7px 11px;
          white-space: nowrap;
        }

        .employee-presence-dot {
          width: 7px;
          height: 7px;
          background: #27d78c;
          border-radius: 50%;
        }

        .employee-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }

        .employee-detail-label {
          color: #91a5c2;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .employee-detail-value {
          color: #e0eaff;
          font-size: 13px;
          font-weight: 550;
          overflow-wrap: anywhere;
        }

        .voice-active {
          color: #5ee6bb;
        }

        .voice-muted {
          color: #f5bf67;
        }

        .voice-inactive {
          color: #9aabc2;
        }

        .people-empty {
          text-align: center;
          padding: 65px 20px;
          background: #142238;
          border: 1px dashed #344b68;
          border-radius: 15px;
          color: #9aabc2;
        }

        .people-empty h3 {
          color: #e5efff;
          margin-bottom: 8px;
        }

        @media (max-width: 900px) {
          .employee-card {
            grid-template-columns: minmax(200px, 1fr) minmax(110px, 0.6fr) minmax(130px, 0.8fr);
            row-gap: 16px;
          }
        }

        @media (max-width: 600px) {
          .people-container {
            padding: 22px 15px;
          }

          .people-heading h1 {
            font-size: 24px;
          }

          .employee-card {
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            padding: 17px;
          }

          .employee-card-top {
            grid-column: 1 / -1;
          }

          .employee-presence {
            grid-column: 1 / -1;
          }
        }
      `}</style>

      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="People"
      />

      <section className="people-container">
        <div className="people-heading">
          <div>
            <h1>People</h1>
            <p>
              Discover and connect with colleagues in your virtual office.
            </p>
          </div>

          <div className="people-live-status">
            <span className="people-live-dot" />
            {connected ? "Live connection" : "Connecting..."}
          </div>
        </div>

        {/* STATISTICS */}
        <div className="people-stats">
          <div className="people-stat-card">
            <div className="people-stat-label">
              Total Employees Online
            </div>
            <div className="people-stat-value">
              {employees.length}
            </div>
          </div>

          <div className="people-stat-card">
            <div className="people-stat-label">
              Currently in Voice Chat
            </div>
            <div className="people-stat-value">
              {employees.filter(
                (employee) => employee.isVoiceActive
              ).length}
            </div>
          </div>

          <div className="people-stat-card">
            <div className="people-stat-label">
              Currently in the Office
            </div>
            <div className="people-stat-value">
              {employees.length}
            </div>
          </div>
        </div>

        {/* SEARCH */}
        <div className="people-search-area">
          <input
            className="people-search"
            type="text"
            placeholder="🔍 Search by employee name or ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <span className="people-results">
            Showing {filteredEmployees.length} of {employees.length} employees
          </span>
        </div>

        {/* EMPLOYEE DIRECTORY */}
        {filteredEmployees.length > 0 ? (
          <div className="people-grid">
            {filteredEmployees.map((employee) => {
              const initials = (employee.name || "Guest")
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase();

              const voiceStatus = !employee.isVoiceActive
                ? "Not in voice"
                : employee.isMuted
                  ? "Muted"
                  : "In voice";

              const voiceClass = !employee.isVoiceActive
                ? "voice-inactive"
                : employee.isMuted
                  ? "voice-muted"
                  : "voice-active";

              return (
                <article
                  className="employee-card"
                  key={employee.socketId || employee.userId}
                >
                  <div className="employee-card-top">
                    <div className="employee-avatar">
                      {initials}
                    </div>

                    <div>
                      <div className="employee-name">
                        {employee.name || "Guest"}
                      </div>

                      <div className="employee-id">
                        @{employee.userId || "unknown"}
                      </div>
                    </div>
                  </div>

                  <div className="employee-presence">
                    <span className="employee-presence-dot" />
                    Online
                  </div>

                  <div className="employee-info">
                    <span className="employee-detail-label">
                      Voice Status
                    </span>

                    <span className={`employee-detail-value ${voiceClass}`}>
                      {voiceStatus}
                    </span>
                  </div>

                  <div className="employee-info">
                    <span className="employee-detail-label">
                      Office Position
                    </span>

                    <span className="employee-detail-value">
                      X: {employee.x} / Y: {employee.y}
                    </span>
                  </div>

                  <div className="employee-info">
                    <span className="employee-detail-label">
                      Account / Connection
                    </span>

                    <span className="employee-detail-value">
                      {employee.userId || "N/A"}
                    </span>

                    <span
                      className="employee-detail-label"
                      title={employee.socketId}
                    >
                      {employee.socketId
                        ? `ID: ${employee.socketId.slice(0, 9)}...`
                        : "Connection ID: N/A"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="people-empty">
            <h3>
              {connected
                ? search
                  ? "No matching employees found"
                  : "No employees in the office"
                : "Connecting to ProxiSpeak..."}
            </h3>

            <p>
              {search
                ? "Try searching with another name or account ID."
                : "Employees will automatically appear here when they join the virtual office."}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

export default People;
