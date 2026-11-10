
import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import socket from "../socket";
import "./Meetings.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function formatDate(date) {
  if (!date) return "Date not set";

  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateInput(date) {
  const value = new Date(date);
  const local = new Date(
    value.getTime() - value.getTimezoneOffset() * 60000
  );

  return local.toISOString().slice(0, 16);
}

function formatTime(date) {
  if (!date) return "Not started";

  return new Date(date).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Meetings({ user, onNavigate, onLogout }) {
  const [meetings, setMeetings] = useState([]);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [notice, setNotice] = useState({
    type: "",
    message: "",
  });

  const [form, setForm] = useState({
    title: "",
    description: "",
    meetingType: "instant",
    scheduledAt: formatDateInput(Date.now() + 60 * 60 * 1000),
  });

  const token = user?.token;
  const employeeId = user?.employeeId;
  const teamId = user?.teamId;

  // ACTIVE PARTICIPANTS
  const activeParticipants = useMemo(() => {
    return (selectedMeeting?.participants || []).filter(
      (participant) => !participant.leftAt
    );
  }, [selectedMeeting]);

  // PENDING ACCESS REQUESTS
  const pendingRequests = useMemo(() => {
    return (selectedMeeting?.accessRequests || []).filter(
      (request) => request.status === "pending"
    );
  }, [selectedMeeting]);

  // HOST CHECK
  const isHost = Boolean(
    employeeId &&
    selectedMeeting?.hostEmployeeId === employeeId
  );

  // SAME TEAM CHECK
  const isSameTeam = Boolean(
    teamId &&
    selectedMeeting?.teamId &&
    selectedMeeting.teamId === teamId
  );

  // CURRENT EMPLOYEE PARTICIPATION
  const isParticipant = activeParticipants.some(
    (participant) => participant.employeeId === employeeId
  );

  // CURRENT EMPLOYEE ACCESS REQUEST
  const myAccessRequest = (selectedMeeting?.accessRequests || []).find(
    (request) => request.employeeId === employeeId
  );

  const hasApprovedAccess =
    isHost ||
    isSameTeam ||
    myAccessRequest?.status === "approved";

  const hasPendingAccessRequest =
    myAccessRequest?.status === "pending";

  // FILTER MEETINGS
  const filteredMeetings = useMemo(() => {
    if (activeTab === "live") {
      return meetings.filter(
        (meeting) => meeting.status === "live"
      );
    }

    if (activeTab === "upcoming") {
      return meetings.filter(
        (meeting) => meeting.status === "scheduled"
      );
    }

    if (activeTab === "ended") {
      return meetings.filter(
        (meeting) => meeting.status === "ended"
      );
    }

    return meetings;
  }, [meetings, activeTab]);

  const showNotice = (message, type = "success") => {
    setNotice({ message, type });
  };

  // API REQUEST HELPER
  const apiRequest = useCallback(
    async (path, options = {}) => {
      if (!token) {
        throw new Error(
          "Your login session is missing. Please log in again."
        );
      }

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options.headers,
        },
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(
          data.message ||
            data.error ||
            "Something went wrong. Please try again."
        );
      }

      return data;
    },
    [token]
  );

  // LOAD TEAM MEETINGS
  const loadMeetings = useCallback(async () => {
    try {
      const data = await apiRequest("/api/meetings");

      const list = Array.isArray(data)
        ? data
        : data.meetings || data.data || [];

      setMeetings(list);

      return list;
    } catch (error) {
      showNotice(error.message, "error");
      return [];
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  // LOAD SINGLE MEETING DETAILS
  const loadMeetingDetails = useCallback(
    async (meetingId, openModal = true) => {
      if (!meetingId) {
        throw new Error("Meeting ID is missing.");
      }

      setDetailsLoading(true);

      try {
        const data = await apiRequest(
          `/api/meetings/${meetingId}`
        );

        const meeting = data.meeting || data.data || data;

        setSelectedMeeting(meeting);

        if (openModal) {
          setShowDetails(true);
        }

        return meeting;
      } catch (error) {
        showNotice(error.message, "error");
        throw error;
      } finally {
        setDetailsLoading(false);
      }
    },
    [apiRequest]
  );

  // REFRESH SELECTED MEETING
  const refreshSelectedMeeting = useCallback(async () => {
    if (!selectedMeeting?._id) return;

    try {
      const data = await apiRequest(
        `/api/meetings/${selectedMeeting._id}`
      );

      const meeting = data.meeting || data.data || data;

      setSelectedMeeting(meeting);
    } catch (error) {
      console.error("Meeting refresh failed:", error.message);
    }
  }, [apiRequest, selectedMeeting?._id]);

  // INITIAL LOAD
  useEffect(() => {
    loadMeetings();
  }, [loadMeetings]);

  // EXISTING AUTHENTICATED SOCKET CONNECTION
  useEffect(() => {
    if (!token) return;

    const refreshData = () => {
      loadMeetings();
      refreshSelectedMeeting();
    };

    const meetingEvents = [
      "meetingCreated",
      "meetingStarted",
      "meetingParticipantJoined",
      "meetingParticipantLeft",
      "meetingAccessRequest",
      "meetingAccessDecision",
      "meetingEnded",
      "meetingSocketParticipantConnected",
      "meetingSocketParticipantDisconnected",
    ];

    meetingEvents.forEach((eventName) => {
      socket.on(eventName, refreshData);
    });

    return () => {
      meetingEvents.forEach((eventName) => {
        socket.off(eventName, refreshData);
      });
    };
  }, [token, loadMeetings, refreshSelectedMeeting]);

  // JOIN SOCKET.IO MEETING ROOM
  const joinMeetingSocket = useCallback((meetingId) => {
    return new Promise((resolve, reject) => {
      if (!meetingId) {
        reject(new Error("Meeting ID is missing."));
        return;
      }

      if (!socket.connected) {
        reject(
          new Error(
            "Your real-time connection is not ready. Please reconnect and try again."
          )
        );
        return;
      }

      let completed = false;

      const timeout = setTimeout(() => {
        if (completed) return;

        completed = true;

        reject(
          new Error(
            "Meeting connection timed out. Please try again."
          )
        );
      }, 12000);

      socket.emit(
        "joinMeeting",
        { meetingId },
        (response = {}) => {
          if (completed) return;

          completed = true;
          clearTimeout(timeout);

          if (response.success) {
            console.log(
              "Meeting Socket.IO connection successful:",
              response
            );

            resolve(response);
          } else {
            reject(
              new Error(
                response.message ||
                  "Could not connect to the meeting."
              )
            );
          }
        }
      );
    });
  }, []);

  // OPEN THE MEETING ROOM
  const openMeetingRoom = useCallback(
    (meeting) => {
      if (!meeting?._id && !meeting?.id) {
        throw new Error("Meeting information is incomplete.");
      }

      setShowDetails(false);
      setShowCreateModal(false);

      onNavigate("MeetingRoom", meeting);
    },
    [onNavigate]
  );

  // CREATE MEETING
  const handleCreateMeeting = async (event) => {
    event.preventDefault();

    if (!form.title.trim()) {
      showNotice("Please enter a meeting title.", "error");
      return;
    }

    if (
      form.meetingType === "scheduled" &&
      new Date(form.scheduledAt) <= new Date()
    ) {
      showNotice(
        "Please select a future meeting date and time.",
        "error"
      );
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        meetingType: form.meetingType,
      };

      if (form.meetingType === "scheduled") {
        payload.scheduledAt = new Date(
          form.scheduledAt
        ).toISOString();
      }

      const data = await apiRequest("/api/meetings", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const createdMeeting =
        data.meeting || data.data || data;

      setShowCreateModal(false);

      setForm({
        title: "",
        description: "",
        meetingType: "instant",
        scheduledAt: formatDateInput(
          Date.now() + 60 * 60 * 1000
        ),
      });

      await loadMeetings();

      if (!createdMeeting?._id) {
        throw new Error(
          "Meeting was created, but its ID was not returned."
        );
      }

      if (createdMeeting.status === "scheduled") {
        showNotice("Meeting scheduled successfully!");
        return;
      }

      const meeting = await loadMeetingDetails(
        createdMeeting._id,
        false
      );

      await joinMeetingSocket(createdMeeting._id);

      showNotice("Meeting created. Connecting to your room...");

      openMeetingRoom(meeting);
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // START SCHEDULED MEETING
  const handleStartMeeting = async () => {
    if (!selectedMeeting?._id) return;

    setSubmitting(true);

    try {
      const meetingId = selectedMeeting._id;

      await apiRequest(
        `/api/meetings/${meetingId}/start`,
        { method: "POST" }
      );

      await apiRequest(
        `/api/meetings/${meetingId}/join`,
        { method: "POST" }
      );

      const meeting = await loadMeetingDetails(
        meetingId,
        false
      );

      await loadMeetings();
      await joinMeetingSocket(meetingId);

      showNotice("Meeting started. Opening meeting room...");

      openMeetingRoom(meeting);
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // JOIN LIVE MEETING
  const handleJoinMeeting = async () => {
    if (!selectedMeeting?._id) return;

    setSubmitting(true);

    try {
      const meetingId = selectedMeeting._id;

      await apiRequest(
        `/api/meetings/${meetingId}/join`,
        { method: "POST" }
      );

      const meeting = await loadMeetingDetails(
        meetingId,
        false
      );

      await loadMeetings();
      await joinMeetingSocket(meetingId);

      showNotice("Connected. Opening meeting room...");

      openMeetingRoom(meeting);
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // REJOIN AN EXISTING LIVE MEETING
  // This is for employees who were already participants
  // but returned to the Meetings page after logging in again.
  const handleRejoinMeeting = async () => {
    if (!selectedMeeting?._id) return;

    setSubmitting(true);

    try {
      const meetingId = selectedMeeting._id;

      // Refresh details to verify that the meeting is still live
      // and that this employee is still an active participant.
      const meeting = await loadMeetingDetails(
        meetingId,
        false
      );

      if (meeting.status !== "live") {
        throw new Error("This meeting is no longer live.");
      }

      const stillParticipant = (
        meeting.participants || []
      ).some(
        (participant) =>
          participant.employeeId === employeeId &&
          !participant.leftAt
      );

      if (!stillParticipant) {
        throw new Error(
          "You are no longer an active participant in this meeting. Please join again."
        );
      }

      // Reconnect to the existing Socket.IO meeting room.
      await joinMeetingSocket(meetingId);

      showNotice("Reconnecting to your meeting...");

      // Open the original meeting, not a new one.
      openMeetingRoom(meeting);
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // REQUEST CROSS-TEAM ACCESS
  const handleRequestAccess = async () => {
    if (!selectedMeeting?._id) return;

    setSubmitting(true);

    try {
      await apiRequest(
        `/api/meetings/${selectedMeeting._id}/access-requests`,
        { method: "POST" }
      );

      await loadMeetingDetails(selectedMeeting._id);

      showNotice("Access request sent to the meeting host.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // HOST APPROVES OR REJECTS REQUEST
  const handleAccessDecision = async (
    requestEmployeeId,
    decision
  ) => {
    if (!selectedMeeting?._id) return;

    setSubmitting(true);

    try {
      await apiRequest(
        `/api/meetings/${selectedMeeting._id}/access-requests/${requestEmployeeId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ decision }),
        }
      );

      await loadMeetingDetails(selectedMeeting._id);
      await loadMeetings();

      showNotice(
        decision === "approved"
          ? "Access request approved."
          : "Access request rejected."
      );
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // LEAVE MEETING FROM DETAILS MODAL
  const handleLeaveMeeting = async () => {
    if (!selectedMeeting?._id) return;

    setSubmitting(true);

    try {
      await apiRequest(
        `/api/meetings/${selectedMeeting._id}/leave`,
        { method: "POST" }
      );

      await loadMeetingDetails(selectedMeeting._id);
      await loadMeetings();

      showNotice("You left the meeting.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  // END MEETING FROM DETAILS MODAL
  const handleEndMeeting = async () => {
    if (!selectedMeeting?._id) return;

    const confirmed = window.confirm(
      "Are you sure you want to end this meeting for everyone?"
    );

    if (!confirmed) return;

    setSubmitting(true);

    try {
      await apiRequest(
        `/api/meetings/${selectedMeeting._id}/end`,
        { method: "POST" }
      );

      await loadMeetingDetails(selectedMeeting._id);
      await loadMeetings();

      showNotice("Meeting ended successfully.");
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openMeeting = (meeting) => {
    loadMeetingDetails(meeting._id);
  };

  const closeDetails = () => {
    if (submitting) return;

    setShowDetails(false);
    setSelectedMeeting(null);
  };

  return (
    <main className="app meetings-page">
      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="Meetings"
      />

      <section className="meetings-container">
        {/* PAGE HEADER */}
        <div className="meetings-heading">
          <div>
            <p className="meetings-eyebrow">
              PROXISPEAK · TEAM WORKSPACE
            </p>

            <h1>Meetings</h1>

            <p>
              Create meetings, collaborate with your team and stay connected.
            </p>
          </div>

          <button
            className="meetings-create-button"
            onClick={() => setShowCreateModal(true)}
          >
            <span>＋</span> Create Meeting
          </button>
        </div>

        {/* NOTIFICATIONS */}
        {notice.message && (
          <div
            className={`meetings-notice-banner ${notice.type}`}
          >
            <span>
              {notice.type === "error" ? "!" : "✓"}
            </span>

            {notice.message}

            <button
              onClick={() =>
                setNotice({ type: "", message: "" })
              }
            >
              ×
            </button>
          </div>
        )}

        {/* STATISTICS */}
        <div className="meetings-stats">
          <div className="meetings-stat-card">
            <div className="meetings-stat-icon blue-icon">
              ▦
            </div>

            <div>
              <p>Total Meetings</p>
              <h2>{meetings.length}</h2>
            </div>
          </div>

          <div className="meetings-stat-card">
            <div className="meetings-stat-icon green-icon">
              ◉
            </div>

            <div>
              <p>Live Meetings</p>
              <h2>
                {
                  meetings.filter(
                    (meeting) => meeting.status === "live"
                  ).length
                }
              </h2>
            </div>
          </div>

          <div className="meetings-stat-card">
            <div className="meetings-stat-icon purple-icon">
              ◷
            </div>

            <div>
              <p>Scheduled Meetings</p>
              <h2>
                {
                  meetings.filter(
                    (meeting) => meeting.status === "scheduled"
                  ).length
                }
              </h2>
            </div>
          </div>
        </div>

        {/* TEAM MEETINGS */}
        <div className="meetings-section-header">
          <div>
            <h2>Team Meetings</h2>
            <p>
              Meetings created by members of your team.
            </p>
          </div>

          <span className="meetings-count">
            {filteredMeetings.length} Meetings
          </span>
        </div>

        {/* FILTER TABS */}
        <div className="meetings-tabs">
          {[
            ["all", "All Meetings"],
            ["live", "Live Now"],
            ["upcoming", "Upcoming"],
            ["ended", "Ended"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={activeTab === value ? "active" : ""}
              onClick={() => setActiveTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* MEETING LIST */}
        {loading ? (
          <div className="meetings-empty">
            <div className="meetings-loader"></div>
            <p>Loading your team meetings...</p>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="meetings-empty">
            <div className="meetings-empty-icon">▦</div>

            <h3>No meetings found</h3>

            <p>
              {activeTab === "all"
                ? "Create your first team meeting to get started."
                : "There are no meetings in this category right now."}
            </p>

            {activeTab === "all" && (
              <button
                className="meetings-create-button"
                onClick={() => setShowCreateModal(true)}
              >
                ＋ Create Meeting
              </button>
            )}
          </div>
        ) : (
          <div className="meetings-list">
            {filteredMeetings.map((meeting) => {
              const date = new Date(
                meeting.scheduledAt || meeting.createdAt
              );

              const participantCount = (
                meeting.participants || []
              ).filter(
                (participant) => !participant.leftAt
              ).length;

              return (
                <article
                  className="meeting-card"
                  key={meeting._id}
                  onClick={() => openMeeting(meeting)}
                >
                  <div className="meeting-date">
                    <span>
                      {date.toLocaleDateString("en-IN", {
                        month: "short",
                      })}
                    </span>

                    <strong>
                      {date.toLocaleDateString("en-IN", {
                        day: "2-digit",
                      })}
                    </strong>

                    <small>{date.getFullYear()}</small>
                  </div>

                  <div className="meeting-main">
                    <div className="meeting-title-row">
                      <h3>{meeting.title}</h3>

                      <span className="meeting-type">
                        {meeting.meetingType === "instant"
                          ? "Instant"
                          : "Scheduled"}
                      </span>
                    </div>

                    <p className="meeting-description">
                      {meeting.description ||
                        "No description provided."}
                    </p>

                    <div className="meeting-details">
                      <div className="meeting-detail">
                        <span>♙</span>
                        {meeting.hostName}
                      </div>

                      <div className="meeting-detail">
                        <span>♧</span>
                        {meeting.teamName}
                      </div>

                      <div className="meeting-detail">
                        <span>◉</span>
                        {participantCount} participants
                      </div>

                      <div className="meeting-detail">
                        <span>◷</span>

                        {meeting.status === "scheduled"
                          ? formatTime(meeting.scheduledAt)
                          : meeting.status === "live"
                            ? `Started ${formatTime(meeting.startedAt)}`
                            : "Ended"}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`meeting-card-status ${meeting.status}`}
                  >
                    <span className="meeting-upcoming-dot"></span>
                    {meeting.status}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* FOOTER */}
        <footer className="meetings-footer">
          <span>ProxiSpeak · Meeting Workspace</span>
          <span>
            Team-based meetings · Real-time collaboration
          </span>
        </footer>
      </section>

      {/* CREATE MEETING MODAL */}
      {showCreateModal && (
        <div
          className="meeting-modal-overlay"
          onClick={() =>
            !submitting && setShowCreateModal(false)
          }
        >
          <div
            className="meeting-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="meeting-modal-header">
              <div>
                <p className="meetings-eyebrow">
                  TEAM COLLABORATION
                </p>

                <h2>Create a Meeting</h2>

                <p>
                  Set up an instant or scheduled team meeting.
                </p>
              </div>

              <button
                className="meeting-modal-close"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateMeeting}>
              <label>Meeting Title</label>

              <input
                type="text"
                placeholder="e.g. Project Discussion"
                value={form.title}
                onChange={(event) =>
                  setForm({
                    ...form,
                    title: event.target.value,
                  })
                }
                maxLength={100}
                required
              />

              <label>Description</label>

              <textarea
                placeholder="What will this meeting be about?"
                value={form.description}
                onChange={(event) =>
                  setForm({
                    ...form,
                    description: event.target.value,
                  })
                }
                rows={3}
              />

              <label>Meeting Type</label>

              <div className="meeting-type-options">
                <button
                  type="button"
                  className={
                    form.meetingType === "instant"
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setForm({
                      ...form,
                      meetingType: "instant",
                    })
                  }
                >
                  <strong>⚡ Instant Meeting</strong>
                  <span>
                    Start your meeting immediately.
                  </span>
                </button>

                <button
                  type="button"
                  className={
                    form.meetingType === "scheduled"
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setForm({
                      ...form,
                      meetingType: "scheduled",
                    })
                  }
                >
                  <strong>▦ Schedule Meeting</strong>
                  <span>
                    Choose a future date and time.
                  </span>
                </button>
              </div>

              {form.meetingType === "scheduled" && (
                <>
                  <label>Scheduled Date and Time</label>

                  <input
                    type="datetime-local"
                    value={form.scheduledAt}
                    min={formatDateInput(
                      Date.now() + 60000
                    )}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        scheduledAt: event.target.value,
                      })
                    }
                    required
                  />
                </>
              )}

              <div className="meeting-modal-info">
                <span>ⓘ</span>

                This meeting will be created under your team.
                Your team members will be able to see it.
              </div>

              <div className="meeting-modal-actions">
                <button
                  type="button"
                  className="meeting-secondary-button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="meetings-create-button"
                  disabled={submitting}
                >
                  {submitting
                    ? "Creating..."
                    : "Create Meeting"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MEETING DETAILS MODAL */}
      {showDetails && (
        <div
          className="meeting-modal-overlay"
          onClick={closeDetails}
        >
          <div
            className="meeting-modal meeting-details-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="meeting-modal-header">
              <div>
                <p className="meetings-eyebrow">
                  MEETING INFORMATION
                </p>

                <h2>
                  {selectedMeeting?.title || "Meeting Details"}
                </h2>

                <p>
                  {selectedMeeting?.teamName} · Hosted by{" "}
                  {selectedMeeting?.hostName}
                </p>
              </div>

              <button
                className="meeting-modal-close"
                onClick={closeDetails}
                disabled={submitting}
              >
                ×
              </button>
            </div>

            {detailsLoading ? (
              <div className="meetings-empty">
                <div className="meetings-loader"></div>
                <p>Loading meeting details...</p>
              </div>
            ) : selectedMeeting ? (
              <>
                {/* MEETING SUMMARY */}
                <div className="meeting-details-summary">
                  <span
                    className={`meeting-card-status ${selectedMeeting.status}`}
                  >
                    <span className="meeting-upcoming-dot"></span>
                    {selectedMeeting.status}
                  </span>

                  <p>
                    {selectedMeeting.description ||
                      "No description provided."}
                  </p>

                  <div className="meeting-detail-grid">
                    <div>
                      <span>Meeting Type</span>
                      <strong>
                        {selectedMeeting.meetingType}
                      </strong>
                    </div>

                    <div>
                      <span>Scheduled</span>
                      <strong>
                        {formatDate(
                          selectedMeeting.scheduledAt ||
                            selectedMeeting.createdAt
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Start Time</span>
                      <strong>
                        {formatTime(selectedMeeting.startedAt)}
                      </strong>
                    </div>

                    <div>
                      <span>Host</span>
                      <strong>
                        {selectedMeeting.hostName}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* PARTICIPANTS */}
                <div className="meeting-participants-section">
                  <div className="meeting-subheading">
                    <h3>Participants</h3>
                    <span>
                      {activeParticipants.length} joined
                    </span>
                  </div>

                  {activeParticipants.length === 0 ? (
                    <p className="meeting-muted">
                      No active participants yet.
                    </p>
                  ) : (
                    <div className="meeting-participant-list">
                      {activeParticipants.map((participant) => (
                        <div
                          className="meeting-participant"
                          key={participant.employeeId}
                        >
                          <div className="meeting-avatar">
                            {(participant.name || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>{participant.name}</strong>
                            <span>
                              {participant.employeeId}
                            </span>
                          </div>

                          {participant.employeeId ===
                            selectedMeeting.hostEmployeeId && (
                            <span className="meeting-host-tag">
                              HOST
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* HOST ACCESS REQUEST CONTROLS */}
                {isHost && pendingRequests.length > 0 && (
                  <div className="meeting-access-section">
                    <div className="meeting-subheading">
                      <h3>Access Requests</h3>
                      <span>
                        {pendingRequests.length} pending
                      </span>
                    </div>

                    {pendingRequests.map((request) => (
                      <div
                        className="meeting-access-request"
                        key={request.employeeId}
                      >
                        <div>
                          <strong>{request.name}</strong>

                          <span>
                            {request.employeeId} ·{" "}
                            {request.teamName}
                          </span>
                        </div>

                        <div className="meeting-request-actions">
                          <button
                            className="meeting-approve-button"
                            disabled={submitting}
                            onClick={() =>
                              handleAccessDecision(
                                request.employeeId,
                                "approved"
                              )
                            }
                          >
                            Approve
                          </button>

                          <button
                            className="meeting-reject-button"
                            disabled={submitting}
                            onClick={() =>
                              handleAccessDecision(
                                request.employeeId,
                                "rejected"
                              )
                            }
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* MEETING ACTIONS */}
                <div className="meeting-modal-actions meeting-detail-actions">
                  {/* HOST STARTS SCHEDULED MEETING */}
                  {selectedMeeting.status === "scheduled" &&
                    isHost && (
                      <button
                        className="meetings-create-button"
                        onClick={handleStartMeeting}
                        disabled={submitting}
                      >
                        {submitting
                          ? "Starting..."
                          : "Start Meeting"}
                      </button>
                    )}

                  {/* EXISTING PARTICIPANT REJOINS LIVE MEETING */}
                  {selectedMeeting.status === "live" &&
                    isParticipant && (
                      <button
                        className="meetings-create-button"
                        onClick={handleRejoinMeeting}
                        disabled={submitting}
                      >
                        {submitting
                          ? "Reconnecting..."
                          : "↻ Rejoin Meeting"}
                      </button>
                    )}

                  {/* NEW AUTHORIZED EMPLOYEE JOINS LIVE MEETING */}
                  {selectedMeeting.status === "live" &&
                    !isParticipant &&
                    hasApprovedAccess && (
                      <button
                        className="meetings-create-button"
                        onClick={handleJoinMeeting}
                        disabled={submitting}
                      >
                        {submitting
                          ? "Joining..."
                          : "Join Meeting"}
                      </button>
                    )}

                  {/* CROSS-TEAM ACCESS REQUEST */}
                  {selectedMeeting.status === "live" &&
                    !isParticipant &&
                    !hasApprovedAccess &&
                    !hasPendingAccessRequest && (
                      <button
                        className="meetings-create-button"
                        onClick={handleRequestAccess}
                        disabled={submitting}
                      >
                        {submitting
                          ? "Sending..."
                          : "Request Access"}
                      </button>
                    )}

                  {/* PENDING REQUEST */}
                  {selectedMeeting.status === "live" &&
                    !isParticipant &&
                    hasPendingAccessRequest && (
                      <span className="meeting-card-status scheduled">
                        Awaiting Host Approval
                      </span>
                    )}

                  {/* APPROVED CROSS-TEAM USER */}
                  {selectedMeeting.status === "live" &&
                    !isParticipant &&
                    myAccessRequest?.status === "approved" && (
                      <span className="meeting-muted">
                        Your access request has been approved.
                      </span>
                    )}

                  {/* PARTICIPANT LEAVES */}
                  {selectedMeeting.status === "live" &&
                    isParticipant &&
                    !isHost && (
                      <button
                        className="meeting-secondary-button"
                        onClick={handleLeaveMeeting}
                        disabled={submitting}
                      >
                        Leave Meeting
                      </button>
                    )}

                  {/* HOST ENDS MEETING */}
                  {selectedMeeting.status === "live" &&
                    isHost && (
                      <button
                        className="meeting-end-button"
                        onClick={handleEndMeeting}
                        disabled={submitting}
                      >
                        End Meeting
                      </button>
                    )}

                  <button
                    className="meeting-secondary-button"
                    onClick={closeDetails}
                    disabled={submitting}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}

export default Meetings;
