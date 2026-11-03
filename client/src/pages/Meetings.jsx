import Header from "../components/Header";
import "./Meetings.css";

const meetings = [
  {
    id: 1,
    title: "Weekly Team Meeting",
    description:
      "Weekly discussion about project progress, tasks, and upcoming priorities.",
    date: "November 5, 2026",
    day: "05",
    month: "NOV",
    time: "10:00 AM - 11:00 AM",
    duration: "60 minutes",
    host: "HR / Team Administration",
    type: "Team Meeting",
    status: "Upcoming",
  },
  {
    id: 2,
    title: "Project Progress Review",
    description:
      "Review current development progress, discuss challenges, and plan the next milestones.",
    date: "November 6, 2026",
    day: "06",
    month: "NOV",
    time: "02:00 PM - 03:00 PM",
    duration: "60 minutes",
    host: "Project Management",
    type: "Project Review",
    status: "Upcoming",
  },
  {
    id: 3,
    title: "Monthly Company Meeting",
    description:
      "Company-wide announcements, organizational updates, and important discussions.",
    date: "November 9, 2026",
    day: "09",
    month: "NOV",
    time: "11:00 AM - 12:00 PM",
    duration: "60 minutes",
    host: "Company Administration",
    type: "Company Meeting",
    status: "Upcoming",
  },
];

function Meetings({ user, onNavigate, onLogout }) {
  return (
    <main className="app meetings-page">
      {/* NAVIGATION HEADER */}
      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="Meetings"
      />

      <section className="meetings-container">

        {/* PAGE HEADING */}
        <div className="meetings-heading">
          <div>
            <p className="meetings-eyebrow">ORGANIZATION WORKSPACE</p>
            <h1>Meetings</h1>
            <p>
              Stay updated with your upcoming meetings and company schedules.
            </p>
          </div>

          <div className="meetings-header-status">
            <span className="meetings-status-dot"></span>
            Company Managed
          </div>
        </div>

        {/* STATISTICS */}
        <div className="meetings-stats">

          <div className="meetings-stat-card">
            <div className="meetings-stat-icon blue-icon">
              <span>▦</span>
            </div>

            <div>
              <p>Total Scheduled</p>
              <h2>{meetings.length}</h2>
            </div>
          </div>

          <div className="meetings-stat-card">
            <div className="meetings-stat-icon green-icon">
              <span>◷</span>
            </div>

            <div>
              <p>Upcoming Meetings</p>
              <h2>{meetings.length}</h2>
            </div>
          </div>

          <div className="meetings-stat-card">
            <div className="meetings-stat-icon purple-icon">
              <span>◉</span>
            </div>

            <div>
              <p>Meeting Duration</p>
              <h2>60 min</h2>
            </div>
          </div>

        </div>

        {/* SCHEDULE SECTION */}
        <div className="meetings-section-header">
          <div>
            <h2>Upcoming Schedule</h2>
            <p>Meetings organized by your company administration.</p>
          </div>

          <span className="meetings-count">
            {meetings.length} Meetings
          </span>
        </div>

        {/* MEETING LIST */}
        <div className="meetings-list">

          {meetings.map((meeting) => (
            <article className="meeting-card" key={meeting.id}>

              {/* DATE */}
              <div className="meeting-date">
                <span>{meeting.month}</span>
                <strong>{meeting.day}</strong>
                <small>2026</small>
              </div>

              {/* MAIN INFORMATION */}
              <div className="meeting-main">

                <div className="meeting-title-row">
                  <h3>{meeting.title}</h3>

                  <span className="meeting-type">
                    {meeting.type}
                  </span>
                </div>

                <p className="meeting-description">
                  {meeting.description}
                </p>

                <div className="meeting-details">

                  <div className="meeting-detail">
                    <span className="meeting-detail-icon">◷</span>
                    {meeting.time}
                  </div>

                  <div className="meeting-detail">
                    <span className="meeting-detail-icon">⏱</span>
                    {meeting.duration}
                  </div>

                  <div className="meeting-detail">
                    <span className="meeting-detail-icon">♙</span>
                    {meeting.host}
                  </div>

                </div>

              </div>

              {/* STATUS */}
              <div className="meeting-card-status">
                <span className="meeting-upcoming-dot"></span>
                {meeting.status}
              </div>

            </article>
          ))}

        </div>

        {/* COMPANY MANAGEMENT NOTICE */}
        <section className="meetings-management-card">

          <div className="meetings-management-icon">
            <svg viewBox="0 0 24 24" fill="none">
              <rect
                x="3"
                y="4"
                width="18"
                height="17"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.5"
              />

              <path
                d="M16 2V6M8 2V6M3 10H21"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />

              <path
                d="M8 14H8.01M12 14H12.01M16 14H16.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <div className="meetings-management-content">

            <span className="meetings-management-tag">
              COMPANY MANAGED SCHEDULE
            </span>

            <h2>
              Your meetings are organized by the company.
            </h2>

            <p>
              Meeting schedules, invitations, and updates are managed by
              authorized company administrators. Employees can view their
              schedules here and stay informed about upcoming discussions.
            </p>

            <div className="meetings-notice">
              <span>i</span>

              <div>
                <strong>Need to schedule or change a meeting?</strong>
                <p>
                  Please contact your HR department or company administrator
                  for meeting requests, rescheduling, or cancellations.
                </p>
              </div>
            </div>

          </div>

        </section>

        {/* FOOTER */}
        <footer className="meetings-footer">
          <span>ProxiSpeak · Meeting Workspace</span>
          <span>Meeting schedules are maintained by company administration.</span>
        </footer>

      </section>
    </main>
  );
}

export default Meetings;