
import { useState, useEffect, useCallback, useRef } from "react";

import Login from "./pages/Login";
import VirtualOffice from "./pages/VirtualOffice";
import Profile from "./pages/Profile";
import People from "./pages/People";
import MyTeam from "./pages/MyTeam";
import Meetings from "./pages/Meetings";
import MeetingRoom from "./pages/MeetingRoom";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";

import socket from "./socket";
import AppStatusContext from "./AppStatusContext";

const ROOM_NAMES = {
  workspace: "Workspace",
  conference: "Conference Room",
};

const DEFAULT_VOICE_RANGE = 120;
const VOICE_RANGE_STORAGE_KEY = "proxispeak_voice_range";

const INITIAL_VOICE_CONTROLS = {
  voiceJoined: false,
  muted: false,
  voiceError: "",
  audioConnections: 0,
  voiceDisabled: true,
  onJoinVoice: () => {},
  onToggleMute: () => {},
  onLeaveVoice: () => {},
};

function getSavedVoiceRange() {
  try {
    const savedRange = Number(
      localStorage.getItem(VOICE_RANGE_STORAGE_KEY)
    );

    return savedRange === 75 || savedRange === 120
      ? savedRange
      : DEFAULT_VOICE_RANGE;
  } catch {
    return DEFAULT_VOICE_RANGE;
  }
}

function App() {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState("VirtualOffice");
  const [currentRoom, setCurrentRoom] = useState("workspace");

  // Active logical team meeting.
  const [activeMeeting, setActiveMeeting] = useState(null);

  // Meeting return information.
  const meetingSessionRef = useRef(null);

  // Meeting exit confirmation and handover.
  const [showMeetingExitDialog, setShowMeetingExitDialog] =
    useState(false);

  const [pendingMeetingNavigation, setPendingMeetingNavigation] =
    useState(null);

  const [meetingExitRequest, setMeetingExitRequest] = useState(null);
  const meetingExitRequestIdRef = useRef(0);

  // Restore workspace/conference voice after a meeting.
  const [voiceRestoreRequest, setVoiceRestoreRequest] = useState(null);
  const voiceRestoreStartedRef = useRef(false);

  // Physical room transition confirmation.
  const [pendingRoom, setPendingRoom] = useState(null);
  const [switchingRoom, setSwitchingRoom] = useState(false);
  const [roomSwitchError, setRoomSwitchError] = useState("");

  // Browser history references.
  const currentPageRef = useRef(currentPage);
  const currentRoomRef = useRef(currentRoom);
  const pendingHistoryPageRef = useRef(null);

  // Global application status.
  const [connected, setConnected] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [nearbyEmployees, setNearbyEmployees] = useState([]);
  const [voicePeers, setVoicePeers] = useState([]);

  const [voiceRange, setVoiceRange] = useState(DEFAULT_VOICE_RANGE);

  const [voiceRangePreference, setVoiceRangePreference] =
    useState(getSavedVoiceRange);

  const voiceRangePreferenceRef = useRef(voiceRangePreference);

  const [voiceControls, setVoiceControls] = useState(
    INITIAL_VOICE_CONTROLS
  );

  const handleVoiceControlsChange = useCallback((controls) => {
    setVoiceControls(controls);
  }, []);

  useEffect(() => {
    voiceRangePreferenceRef.current = voiceRangePreference;
  }, [voiceRangePreference]);

  const handleVoiceRangeChange = useCallback((newRange) => {
    const selectedRange = Number(newRange);

    if (selectedRange !== 75 && selectedRange !== 120) {
      return;
    }

    setVoiceRangePreference(selectedRange);

    try {
      localStorage.setItem(
        VOICE_RANGE_STORAGE_KEY,
        String(selectedRange)
      );
    } catch (error) {
      console.warn("Could not save voice range preference:", error);
    }

    if (socket.connected) {
      socket.emit("setVoiceRange", {
        voiceRange: selectedRange,
      });
    }
  }, []);

  const [messages, setMessages] = useState([]);

  useEffect(() => {
    currentPageRef.current = currentPage;
    currentRoomRef.current = currentRoom;
  }, [currentPage, currentRoom]);

  // ==========================================
  // START A MEETING AND SUSPEND CURRENT ROOM VOICE
  // ==========================================

  const prepareMeetingEntry = useCallback((selectedMeeting) => {
    if (!selectedMeeting?._id && !selectedMeeting?.id) {
      console.error("Cannot open MeetingRoom: meeting data is missing.");
      return false;
    }

    // Prevent replacing an existing meeting session.
    if (currentPageRef.current === "MeetingRoom") {
      return false;
    }

    // Remember the exact room and voice state.
    meetingSessionRef.current = {
      previousRoom: currentRoomRef.current,
      voiceWasJoined: Boolean(voiceControls.voiceJoined),
      wasMuted: Boolean(voiceControls.muted),
    };

    // Completely stop the previous room voice before mounting MeetingRoom.
    if (voiceControls.voiceJoined) {
      voiceControls.onLeaveVoice?.();
    }

    setVoiceRestoreRequest(null);
    voiceRestoreStartedRef.current = false;

    setActiveMeeting(selectedMeeting);

    return true;
  }, [voiceControls]);

  // ==========================================
  // REQUEST MEETING EXIT
  // ==========================================

  const requestMeetingExit = useCallback((targetPage, targetRoom = null) => {
    if (currentPageRef.current !== "MeetingRoom") return;

    setPendingMeetingNavigation({
      targetPage: targetPage || "VirtualOffice",
      targetRoom:
        targetRoom && ROOM_NAMES[targetRoom]
          ? targetRoom
          : null,
    });

    setShowMeetingExitDialog(true);
  }, []);

  const cancelMeetingExit = useCallback(() => {
    setShowMeetingExitDialog(false);
    setPendingMeetingNavigation(null);
  }, []);

  const confirmMeetingExit = useCallback(
    (destination = "previous") => {
      if (currentPageRef.current !== "MeetingRoom") return;

      const session = meetingSessionRef.current;

      let targetPage = "VirtualOffice";
      let targetRoom = session?.previousRoom || currentRoomRef.current;

      if (destination === "workspace") {
        targetRoom = "workspace";
      } else if (destination === "conference") {
        targetRoom = "conference";
      } else if (destination === "requested") {
        targetPage =
          pendingMeetingNavigation?.targetPage || "VirtualOffice";

        targetRoom =
          pendingMeetingNavigation?.targetRoom || targetRoom;
      }

      meetingExitRequestIdRef.current += 1;

      setMeetingExitRequest({
        id: meetingExitRequestIdRef.current,
        targetPage,
        targetRoom,
      });

      setShowMeetingExitDialog(false);
      setPendingMeetingNavigation(null);
    },
    [pendingMeetingNavigation]
  );

  // ==========================================
  // COMPLETE MEETING EXIT
  // Called by MeetingRoom after its media is stopped
  // and its backend leave/end request succeeds.
  // ==========================================

  const handleMeetingExitComplete = useCallback(
    async (exitData = {}) => {
      const session = meetingSessionRef.current;

      const targetPage =
        exitData.targetPage || "VirtualOffice";

      const targetRoom =
        ROOM_NAMES[exitData.targetRoom]
          ? exitData.targetRoom
          : session?.previousRoom || currentRoomRef.current;

      setMeetingExitRequest(null);
      setShowMeetingExitDialog(false);
      setPendingMeetingNavigation(null);

      // The meeting backend should already have restored presence.
      // Now switch physical rooms if the user selected another room.
      if (targetRoom !== currentRoomRef.current) {
        if (!socket.connected) {
          setRoomSwitchError(
            "You were disconnected while leaving the meeting. Please reconnect."
          );
          return;
        }

        setSwitchingRoom(true);

        const switchResult = await new Promise((resolve) => {
          socket.emit(
            "switchRoom",
            { roomId: targetRoom },
            (response = {}) => resolve(response)
          );
        });

        if (switchResult?.success === false) {
          setSwitchingRoom(false);
          setRoomSwitchError(
            switchResult.message ||
              "Could not enter the selected room."
          );
          return;
        }

        currentRoomRef.current = targetRoom;
        setCurrentRoom(targetRoom);
        setSwitchingRoom(false);
        setRoomSwitchError("");
      }

      setActiveMeeting(null);

      currentPageRef.current = targetPage;
      setCurrentPage(targetPage);

      window.history.replaceState(
        {
          page: targetPage,
          roomId: targetRoom,
        },
        "",
        window.location.pathname
      );

      pendingHistoryPageRef.current = null;

      // Restore voice only if it was active before the meeting.
      if (session?.voiceWasJoined) {
        setVoiceRestoreRequest({
          muted: Boolean(session.wasMuted),
          room: targetRoom,
        });
      } else {
        setVoiceRestoreRequest(null);
      }

      voiceRestoreStartedRef.current = false;
      meetingSessionRef.current = null;
      setPendingRoom(null);
    },
    []
  );

  // ==========================================
  // RESTORE PREVIOUS ROOM VOICE
  // ==========================================

  useEffect(() => {
    if (!voiceRestoreRequest) return;
    if (currentPage === "MeetingRoom") return;
    if (!connected) return;

    // First reconnect to the previous room's voice session.
    if (!voiceControls.voiceJoined) {
      if (voiceRestoreStartedRef.current) return;

      voiceRestoreStartedRef.current = true;

      Promise.resolve(
        voiceControls.onJoinVoice?.()
      ).catch((error) => {
        console.error("Could not restore room voice:", error);
        voiceRestoreStartedRef.current = false;
      });

      return;
    }

    // Once connected, restore the previous mute state.
    if (voiceRestoreRequest.muted && !voiceControls.muted) {
      voiceControls.onToggleMute?.();
    }

    setVoiceRestoreRequest(null);
    voiceRestoreStartedRef.current = false;
  }, [
    voiceRestoreRequest,
    currentPage,
    connected,
    voiceControls,
  ]);

  // ==========================================
  // BROWSER HISTORY
  // ==========================================

  useEffect(() => {
    window.history.replaceState(
      {
        page: "VirtualOffice",
        roomId: "workspace",
      },
      "",
      window.location.pathname
    );

    function handlePopState(event) {
      const targetPage = event.state?.page || "VirtualOffice";
      const requestedRoom = event.state?.roomId || "workspace";

      const targetRoom = ROOM_NAMES[requestedRoom]
        ? requestedRoom
        : "workspace";

      // Browser Back while inside a meeting requires confirmation.
      if (
        currentPageRef.current === "MeetingRoom" &&
        targetPage !== "MeetingRoom"
      ) {
        window.history.pushState(
          {
            page: "MeetingRoom",
            roomId: currentRoomRef.current,
          },
          "",
          window.location.pathname
        );

        requestMeetingExit(targetPage, targetRoom);
        return;
      }

      if (targetRoom !== currentRoomRef.current) {
        window.history.pushState(
          {
            page: currentPageRef.current,
            roomId: currentRoomRef.current,
          },
          "",
          window.location.pathname
        );

        pendingHistoryPageRef.current = targetPage;

        setPendingRoom(targetRoom);
        setRoomSwitchError("");

        return;
      }

      pendingHistoryPageRef.current = null;

      if (targetPage !== "MeetingRoom") {
        setActiveMeeting(null);
      }

      currentPageRef.current = targetPage;
      setCurrentPage(targetPage);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [requestMeetingExit]);

  // ==========================================
  // AUTHENTICATED SOCKET CONNECTION
  // ==========================================

  useEffect(() => {
    if (!user || !user.token) {
      socket.disconnect();

      setConnected(false);
      setEmployees([]);
      setNearbyEmployees([]);
      setVoicePeers([]);
      setMessages([]);

      return;
    }

    socket.auth = {
      token: user.token,
    };

    function handleConnect() {
      console.log("Authenticated Socket.IO connection established.");

      setConnected(true);

      socket.emit("setVoiceRange", {
        voiceRange: voiceRangePreferenceRef.current,
      });
    }

    function handleDisconnect() {
      setConnected(false);
      setEmployees([]);
      setNearbyEmployees([]);
      setVoicePeers([]);
      setVoiceRange(DEFAULT_VOICE_RANGE);
    }

    function handleEmployeesUpdate(updatedEmployees) {
      const employeeList = updatedEmployees || [];

      setEmployees(employeeList);

      const myEmployee = employeeList.find(
        (employee) => employee.socketId === socket.id
      );

      if (myEmployee?.currentRoom) {
        const confirmedRoom = ROOM_NAMES[myEmployee.currentRoom]
          ? myEmployee.currentRoom
          : "workspace";

        currentRoomRef.current = confirmedRoom;
        setCurrentRoom(confirmedRoom);
      }
    }

    function handleProximityUpdate(data = {}) {
      setNearbyEmployees(data.nearbyEmployees || []);
      setVoicePeers(data.voicePeers || []);

      if (data.voiceMode === "proximity") {
        if (Number.isFinite(data.voiceRange)) {
          setVoiceRange(data.voiceRange);
        }
      } else if (data.voiceMode === "group") {
        setVoiceRange(null);
      }
    }

    function handleRoomChanged(data = {}) {
      const newRoom =
        data.roomId ||
        data.currentRoom ||
        data.room?.id;

      if (newRoom && ROOM_NAMES[newRoom]) {
        currentRoomRef.current = newRoom;
        setCurrentRoom(newRoom);

        setPendingRoom(null);
        setSwitchingRoom(false);
        setRoomSwitchError("");

        console.log(
          `Successfully entered ${ROOM_NAMES[newRoom]}.`
        );
      }
    }

    function handleConnectError(error) {
      console.error("Socket connection error:", error.message);
      setConnected(false);
    }

    function handleNewMessage(message) {
      if (!message || !message.id) return;

      setMessages((previousMessages) => {
        if (
          previousMessages.some(
            (existingMessage) =>
              existingMessage.id === message.id
          )
        ) {
          return previousMessages;
        }

        return [...previousMessages, message];
      });
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("employeesUpdate", handleEmployeesUpdate);
    socket.on("proximityUpdate", handleProximityUpdate);
    socket.on("roomChanged", handleRoomChanged);
    socket.on("connect_error", handleConnectError);
    socket.on("newMessage", handleNewMessage);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("employeesUpdate", handleEmployeesUpdate);
      socket.off("proximityUpdate", handleProximityUpdate);
      socket.off("roomChanged", handleRoomChanged);
      socket.off("connect_error", handleConnectError);
      socket.off("newMessage", handleNewMessage);

      socket.disconnect();
    };
  }, [user]);

  // ==========================================
  // LOGIN
  // ==========================================

  function handleLogin(userData) {
    setMessages([]);
    setActiveMeeting(null);
    meetingSessionRef.current = null;

    setMeetingExitRequest(null);
    setVoiceRestoreRequest(null);
    setShowMeetingExitDialog(false);
    setPendingMeetingNavigation(null);

    setCurrentRoom("workspace");
    setCurrentPage("VirtualOffice");

    currentRoomRef.current = "workspace";
    currentPageRef.current = "VirtualOffice";

    setPendingRoom(null);
    setSwitchingRoom(false);
    setRoomSwitchError("");

    pendingHistoryPageRef.current = null;

    setUser(userData);

    window.history.replaceState(
      {
        page: "VirtualOffice",
        roomId: "workspace",
      },
      "",
      window.location.pathname
    );
  }

  // ==========================================
  // LOGOUT
  // ==========================================

  function handleLogout() {
    socket.disconnect();

    setMessages([]);
    setUser(null);
    setActiveMeeting(null);
    meetingSessionRef.current = null;

    setMeetingExitRequest(null);
    setVoiceRestoreRequest(null);
    setShowMeetingExitDialog(false);
    setPendingMeetingNavigation(null);

    setCurrentPage("VirtualOffice");
    setCurrentRoom("workspace");

    currentPageRef.current = "VirtualOffice";
    currentRoomRef.current = "workspace";

    setPendingRoom(null);
    setSwitchingRoom(false);
    setRoomSwitchError("");

    pendingHistoryPageRef.current = null;

    setConnected(false);
    setEmployees([]);
    setNearbyEmployees([]);
    setVoicePeers([]);
    setVoiceRange(DEFAULT_VOICE_RANGE);

    setVoiceControls(INITIAL_VOICE_CONTROLS);

    window.history.replaceState(null, "", "/");
  }

  // ==========================================
  // NAVIGATION
  // ==========================================

  function handleNavigate(page, data = null) {
    // Any attempt to navigate away from a meeting
    // must first pass through the exit confirmation.
    if (
      currentPageRef.current === "MeetingRoom" &&
      page !== "MeetingRoom"
    ) {
      requestMeetingExit(
        page,
        data?.roomId || data?.targetRoom || null
      );
      return;
    }

    if (page === "MeetingRoom") {
      const selectedMeeting = data?.meeting || data;

      const prepared = prepareMeetingEntry(selectedMeeting);

      if (!prepared) return;

      setActiveMeeting(selectedMeeting);
    } else if (page === "Meetings") {
      setActiveMeeting(null);
    }

    if (page === currentPageRef.current) {
      return;
    }

    window.history.pushState(
      {
        page,
        roomId: currentRoomRef.current,
        meetingId:
          page === "MeetingRoom"
            ? (data?.meeting || data)?._id ||
              (data?.meeting || data)?.id
            : undefined,
      },
      "",
      window.location.pathname
    );

    currentPageRef.current = page;
    setCurrentPage(page);
  }

  // ==========================================
  // PHYSICAL ROOM TRANSITION
  // ==========================================

  function handleRequestRoomChange(roomId) {
    if (!ROOM_NAMES[roomId]) {
      console.error("Invalid room:", roomId);
      return;
    }

    // If a room change is requested from MeetingRoom,
    // it must use the meeting exit confirmation instead.
    if (currentPageRef.current === "MeetingRoom") {
      requestMeetingExit("VirtualOffice", roomId);
      return;
    }

    if (roomId === currentRoomRef.current || switchingRoom) {
      return;
    }

    pendingHistoryPageRef.current = null;

    setRoomSwitchError("");
    setPendingRoom(roomId);
  }

  function handleCancelRoomChange() {
    if (switchingRoom) return;

    pendingHistoryPageRef.current = null;

    setPendingRoom(null);
    setRoomSwitchError("");
  }

  function handleConfirmRoomChange() {
    if (!pendingRoom || switchingRoom) return;

    if (!socket.connected) {
      setRoomSwitchError(
        "You are disconnected from the server. Please reconnect and try again."
      );
      return;
    }

    const destinationRoom = pendingRoom;

    setSwitchingRoom(true);
    setRoomSwitchError("");

    socket.emit(
      "switchRoom",
      { roomId: destinationRoom },
      (response = {}) => {
        if (response.success === false) {
          setSwitchingRoom(false);
          setRoomSwitchError(
            response.message ||
              "Unable to switch rooms. Please try again."
          );
          return;
        }

        const confirmedRoom =
          response.roomId ||
          response.currentRoom ||
          response.room?.id;

        const finalRoom =
          confirmedRoom && ROOM_NAMES[confirmedRoom]
            ? confirmedRoom
            : destinationRoom;

        currentRoomRef.current = finalRoom;
        setCurrentRoom(finalRoom);

        currentPageRef.current =
          pendingHistoryPageRef.current || "VirtualOffice";

        setCurrentPage(currentPageRef.current);
        setActiveMeeting(null);

        window.history.replaceState(
          {
            page: currentPageRef.current,
            roomId: finalRoom,
          },
          "",
          window.location.pathname
        );

        pendingHistoryPageRef.current = null;

        setPendingRoom(null);
        setSwitchingRoom(false);
        setRoomSwitchError("");
      }
    );
  }

  // ==========================================
  // LOGIN PAGE
  // ==========================================

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const pageProps = {
    user,
    currentPage,
    currentRoom,

    onNavigate: handleNavigate,
    onRequestRoomChange: handleRequestRoomChange,
    onLogout: handleLogout,
    onBack: () => handleNavigate("VirtualOffice"),

    onlineEmployees: employees,
    connected,
    messages,
  };

  // ==========================================
  // PAGE ROUTING
  // ==========================================

  let currentPageComponent = null;

  switch (currentPage) {
    case "Profile":
      currentPageComponent = <Profile {...pageProps} />;
      break;

    case "People":
      currentPageComponent = <People {...pageProps} />;
      break;

    case "MyTeam":
      currentPageComponent = <MyTeam {...pageProps} />;
      break;

    case "Meetings":
      currentPageComponent = <Meetings {...pageProps} />;
      break;

    case "MeetingRoom":
      currentPageComponent = (
        <MeetingRoom
          {...pageProps}
          meeting={activeMeeting}
          meetingExitRequest={meetingExitRequest}
          onMeetingExitComplete={handleMeetingExitComplete}
        />
      );
      break;

    case "Chat":
      currentPageComponent = <Chat {...pageProps} />;
      break;

    case "Settings":
      currentPageComponent = (
        <Settings
          {...pageProps}
          voiceRangePreference={voiceRangePreference}
          onVoiceRangeChange={handleVoiceRangeChange}
        />
      );
      break;

    case "VirtualOffice":
    default:
      currentPageComponent = null;
      break;
  }

  const currentRoomName = ROOM_NAMES[currentRoom] || "Workspace";

  const destinationRoomName = pendingRoom
    ? ROOM_NAMES[pendingRoom]
    : "";

  const previousMeetingRoom =
    meetingSessionRef.current?.previousRoom || currentRoom;

  // ==========================================
  // UI
  // ==========================================

  return (
    <AppStatusContext.Provider
      value={{
        connected,
        employees,
        nearbyEmployees,
        voicePeers,
        voiceRange,
        voiceRangePreference,
        currentRoom,

        onRequestRoomChange: handleRequestRoomChange,

        ...voiceControls,
      }}
    >
      {/* Persistent VirtualOffice: never unmounted on other pages. */}
      <div
        style={{
          display:
            currentPage === "VirtualOffice" ? "block" : "none",
        }}
      >
        <VirtualOffice
          {...pageProps}
          isActive={currentPage === "VirtualOffice"}
          onVoiceControlsChange={handleVoiceControlsChange}
        />
      </div>

      {/* Other application pages. */}
      {currentPageComponent}

      {/* ======================================
          MEETING EXIT CONFIRMATION
          ====================================== */}
      {showMeetingExitDialog && currentPage === "MeetingRoom" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 20000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(0, 0, 0, 0.78)",
            backdropFilter: "blur(7px)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-exit-title"
            style={{
              width: "100%",
              maxWidth: "460px",
              padding: "28px",
              borderRadius: "18px",
              background: "#171c25",
              border: "1px solid #343d4c",
              color: "#ffffff",
              boxShadow: "0 20px 70px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "14px",
                background: "rgba(255, 170, 60, 0.12)",
                color: "#ffbd65",
                fontSize: "24px",
                marginBottom: "18px",
              }}
            >
              !
            </div>

            <h2
              id="meeting-exit-title"
              style={{
                margin: "0 0 12px",
                fontSize: "21px",
                fontWeight: 700,
              }}
            >
              Leave this meeting?
            </h2>

            <p
              style={{
                margin: "0",
                color: "#b5bdca",
                fontSize: "14px",
                lineHeight: 1.7,
              }}
            >
              Your meeting microphone and screen sharing will stop.
              {activeMeeting?.hostEmployeeId === user?.employeeId
                ? " As the host, leaving will end the meeting for everyone."
                : " You will leave this meeting and return to your selected room."}
            </p>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                onClick={() => confirmMeetingExit("previous")}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "none",
                  borderRadius: "9px",
                  background: "#bee835",
                  color: "#17200a",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Return to {ROOM_NAMES[previousMeetingRoom]}
              </button>

              <button
                type="button"
                onClick={() => confirmMeetingExit("workspace")}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #414b5c",
                  borderRadius: "9px",
                  background: "transparent",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Leave and enter Workspace
              </button>

              <button
                type="button"
                onClick={() => confirmMeetingExit("conference")}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #414b5c",
                  borderRadius: "9px",
                  background: "transparent",
                  color: "#ffffff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Leave and enter Conference Room
              </button>

              {pendingMeetingNavigation &&
                pendingMeetingNavigation.targetPage !== "VirtualOffice" && (
                  <button
                    type="button"
                    onClick={() => confirmMeetingExit("requested")}
                    style={{
                      width: "100%",
                      padding: "12px",
                      border: "1px solid #414b5c",
                      borderRadius: "9px",
                      background: "transparent",
                      color: "#ffffff",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Continue to {pendingMeetingNavigation.targetPage}
                  </button>
                )}

              <button
                type="button"
                onClick={cancelMeetingExit}
                style={{
                  width: "100%",
                  padding: "11px",
                  border: "none",
                  borderRadius: "9px",
                  background: "transparent",
                  color: "#aab4c2",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Stay in Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================
          PHYSICAL ROOM TRANSITION DIALOG
          ====================================== */}
      {pendingRoom && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(0, 0, 0, 0.68)",
            backdropFilter: "blur(5px)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="room-switch-title"
            style={{
              width: "100%",
              maxWidth: "430px",
              padding: "28px",
              borderRadius: "18px",
              background: "#171c25",
              border: "1px solid #343d4c",
              color: "#ffffff",
              boxShadow: "0 20px 70px rgba(0,0,0,0.45)",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "14px",
                background: "rgba(190, 232, 53, 0.12)",
                color: "#bee835",
                fontSize: "24px",
                marginBottom: "18px",
              }}
            >
              ↗
            </div>

            <h2
              id="room-switch-title"
              style={{
                margin: "0 0 12px",
                fontSize: "21px",
                fontWeight: 700,
              }}
            >
              Switch Room?
            </h2>

            <p
              style={{
                margin: "0",
                color: "#b5bdca",
                fontSize: "14px",
                lineHeight: 1.7,
              }}
            >
              You're about to leave{" "}
              <strong style={{ color: "#ffffff" }}>
                {currentRoomName}
              </strong>{" "}
              and enter{" "}
              <strong style={{ color: "#bee835" }}>
                {destinationRoomName}
              </strong>
              .
              <br />
              <br />
              Your current voice session will end during the room
              transition. Would you like to continue?
            </p>

            {roomSwitchError && (
              <p
                role="alert"
                style={{
                  margin: "16px 0 0",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  background: "rgba(255, 75, 75, 0.12)",
                  color: "#ff8585",
                  fontSize: "13px",
                }}
              >
                {roomSwitchError}
              </p>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
                marginTop: "26px",
              }}
            >
              <button
                type="button"
                onClick={handleCancelRoomChange}
                disabled={switchingRoom}
                style={{
                  padding: "11px 19px",
                  borderRadius: "9px",
                  border: "1px solid #414b5c",
                  background: "transparent",
                  color: "#d4dae4",
                  fontWeight: 600,
                  cursor: switchingRoom ? "not-allowed" : "pointer",
                  opacity: switchingRoom ? 0.5 : 1,
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmRoomChange}
                disabled={switchingRoom}
                style={{
                  padding: "11px 19px",
                  border: "none",
                  borderRadius: "9px",
                  background: "#bee835",
                  color: "#17200a",
                  fontWeight: 700,
                  cursor: switchingRoom ? "not-allowed" : "pointer",
                  opacity: switchingRoom ? 0.7 : 1,
                }}
              >
                {switchingRoom ? "Switching..." : "Confirm & Enter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppStatusContext.Provider>
  );
}

export default App;
