
import { useState, useEffect, useCallback, useRef } from "react";

import Login from "./pages/Login";
import VirtualOffice from "./pages/VirtualOffice";
import Profile from "./pages/Profile";
import People from "./pages/People";
import MyTeam from "./pages/MyTeam";
import Meetings from "./pages/Meetings";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";

import socket from "./socket";
import AppStatusContext from "./AppStatusContext";

const ROOM_NAMES = {
  workspace: "Workspace",
  conference: "Conference Room",
  meeting1: "Meeting Room 01",
  meeting2: "Meeting Room 02",
};

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

function App() {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState("VirtualOffice");

  const [currentRoom, setCurrentRoom] = useState("workspace");

  // Room transition confirmation.
  const [pendingRoom, setPendingRoom] = useState(null);
  const [switchingRoom, setSwitchingRoom] = useState(false);
  const [roomSwitchError, setRoomSwitchError] = useState("");

  // Browser history references.
  const currentPageRef = useRef(currentPage);
  const currentRoomRef = useRef(currentRoom);
  const pendingHistoryPageRef = useRef(null);

  // Global live application status.
  const [connected, setConnected] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [nearbyEmployees, setNearbyEmployees] = useState([]);
  const [voiceRange, setVoiceRange] = useState(120);

  // Global voice controls managed by persistent VirtualOffice.
  const [voiceControls, setVoiceControls] = useState(
    INITIAL_VOICE_CONTROLS
  );

  const handleVoiceControlsChange = useCallback((controls) => {
    setVoiceControls(controls);
  }, []);

  // Global temporary chat messages.
  const [messages, setMessages] = useState([]);

  // Keep refs synchronized with the latest application state.
  useEffect(() => {
    currentPageRef.current = currentPage;
    currentRoomRef.current = currentRoom;
  }, [currentPage, currentRoom]);

  // Initialize browser history only once.
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
      const targetRoom = event.state?.roomId || "workspace";

      // Prevent browser Back from bypassing room confirmation.
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

      // Normal browser navigation within the same room.
      pendingHistoryPageRef.current = null;
      setCurrentPage(targetPage);
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // One authenticated Socket.IO connection for the logged-in session.
  useEffect(() => {
    if (!user || !user.token) {
      socket.disconnect();

      setConnected(false);
      setEmployees([]);
      setNearbyEmployees([]);
      setMessages([]);

      return;
    }

    socket.auth = {
      token: user.token,
    };

    function handleConnect() {
      console.log("Authenticated Socket.IO connection established.");
      setConnected(true);
    }

    function handleDisconnect() {
      setConnected(false);
      setEmployees([]);
      setNearbyEmployees([]);
    }

    function handleEmployeesUpdate(updatedEmployees) {
      const employeeList = updatedEmployees || [];

      setEmployees(employeeList);

      const myEmployee = employeeList.find(
        (employee) => employee.socketId === socket.id
      );

      if (myEmployee?.currentRoom) {
        currentRoomRef.current = myEmployee.currentRoom;
        setCurrentRoom(myEmployee.currentRoom);
      }
    }

    function handleProximityUpdate(data = {}) {
      setNearbyEmployees(data.nearbyEmployees || []);

      if (Number.isFinite(data.voiceRange)) {
        setVoiceRange(data.voiceRange);
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

  // Handle successful login.
  function handleLogin(userData) {
    setMessages([]);
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

  // Handle logout.
  function handleLogout() {
    socket.disconnect();

    setMessages([]);
    setUser(null);
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

    setVoiceControls(INITIAL_VOICE_CONTROLS);

    window.history.replaceState(null, "", "/");
  }

  // Normal application navigation.
  // This does not trigger room-switch confirmation.
  function handleNavigate(page) {
    if (page === currentPageRef.current) return;

    window.history.pushState(
      {
        page,
        roomId: currentRoomRef.current,
      },
      "",
      window.location.pathname
    );

    currentPageRef.current = page;
    setCurrentPage(page);
  }

  // Request a room transition.
  function handleRequestRoomChange(roomId) {
    if (!ROOM_NAMES[roomId]) {
      console.error("Invalid room:", roomId);
      return;
    }

    // No confirmation when selecting the current room.
    if (roomId === currentRoomRef.current) {
      return;
    }

    if (switchingRoom) {
      return;
    }

    pendingHistoryPageRef.current = null;

    setRoomSwitchError("");
    setPendingRoom(roomId);
  }

  // Cancel a room transition.
  function handleCancelRoomChange() {
    if (switchingRoom) return;

    pendingHistoryPageRef.current = null;

    setPendingRoom(null);
    setRoomSwitchError("");
  }

  // Confirm and request the room transition from the server.
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

        // Update the room immediately.
        currentRoomRef.current = finalRoom;
        setCurrentRoom(finalRoom);

        // IMPORTANT:
        // Every successful room transition opens VirtualOffice.
        // It does not matter which page the user came from.
        currentPageRef.current = "VirtualOffice";
        setCurrentPage("VirtualOffice");

        // Update the current history entry to the destination room.
        window.history.replaceState(
          {
            page: "VirtualOffice",
            roomId: finalRoom,
          },
          "",
          window.location.pathname
        );

        // Clear any pending browser-history navigation.
        pendingHistoryPageRef.current = null;

        setPendingRoom(null);
        setSwitchingRoom(false);
        setRoomSwitchError("");

        console.log(
          `Entered ${ROOM_NAMES[finalRoom]} successfully.`
        );
      }
    );
  }

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

    case "Chat":
      currentPageComponent = <Chat {...pageProps} />;
      break;

    case "Settings":
      currentPageComponent = <Settings {...pageProps} />;
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

  return (
    <AppStatusContext.Provider
      value={{
        connected,
        employees,
        nearbyEmployees,
        voiceRange,
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

      {/* Room transition confirmation dialog. */}
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
