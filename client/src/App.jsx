import { useState, useEffect, useCallback } from "react";

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

function App() {
  const [user, setUser] = useState(null);
  const [currentPage, setCurrentPage] = useState("VirtualOffice");

  // Global live application status.
  const [connected, setConnected] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [nearbyEmployees, setNearbyEmployees] = useState([]);
  const [voiceRange, setVoiceRange] = useState(120);

  // Global voice controls managed by the persistent VirtualOffice.
  const [voiceControls, setVoiceControls] = useState({
    voiceJoined: false,
    muted: false,
    voiceError: "",
    audioConnections: 0,
    voiceDisabled: true,
    onJoinVoice: () => {},
    onToggleMute: () => {},
    onLeaveVoice: () => {},
  });

  const handleVoiceControlsChange = useCallback((controls) => {
    setVoiceControls(controls);
  }, []);

  // GLOBAL TEMPORARY CHAT MESSAGES.
  const [messages, setMessages] = useState([]);

  // Keep browser history synchronized.
  useEffect(() => {
    window.history.replaceState(
      { page: "VirtualOffice" },
      "",
      window.location.pathname
    );

    function handlePopState(event) {
      setCurrentPage(event.state?.page || "VirtualOffice");
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
      setEmployees(updatedEmployees || []);
    }

    function handleProximityUpdate(data = {}) {
      setNearbyEmployees(data.nearbyEmployees || []);

      if (Number.isFinite(data.voiceRange)) {
        setVoiceRange(data.voiceRange);
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
            (existingMessage) => existingMessage.id === message.id
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
      socket.off("connect_error", handleConnectError);
      socket.off("newMessage", handleNewMessage);

      socket.disconnect();
    };
  }, [user]);

  // Handle successful login.
  function handleLogin(userData) {
    setMessages([]);
    setUser(userData);
    setCurrentPage("VirtualOffice");

    window.history.replaceState(
      { page: "VirtualOffice" },
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

    setConnected(false);
    setEmployees([]);
    setNearbyEmployees([]);

    setVoiceControls({
      voiceJoined: false,
      muted: false,
      voiceError: "",
      audioConnections: 0,
      voiceDisabled: true,
      onJoinVoice: () => {},
      onToggleMute: () => {},
      onLeaveVoice: () => {},
    });

    window.history.replaceState(null, "", "/");
  }

  // Handle application navigation.
  function handleNavigate(page) {
    if (page === currentPage) return;

    window.history.pushState(
      { page },
      "",
      window.location.pathname
    );

    setCurrentPage(page);
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const pageProps = {
    user,
    currentPage,
    onNavigate: handleNavigate,
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
      // VirtualOffice is rendered separately and stays mounted.
      currentPageComponent = null;
      break;
  }

  return (
    <AppStatusContext.Provider
      value={{
        connected,
        employees,
        nearbyEmployees,
        voiceRange,

        // Shared global voice controls.
        ...voiceControls,
      }}
    >
      {/* Persistent VirtualOffice: hidden, not unmounted, on other pages. */}
      <div
        style={{
          display: currentPage === "VirtualOffice" ? "block" : "none",
        }}
      >
        <VirtualOffice
          {...pageProps}
          isActive={currentPage === "VirtualOffice"}
          onVoiceControlsChange={handleVoiceControlsChange}
        />
      </div>

      {/* Other application pages render normally. */}
      {currentPageComponent}
    </AppStatusContext.Provider>
  );
}

export default App;