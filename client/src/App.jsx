import { useState, useEffect } from "react";

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

      return;
    }

    // Send JWT token to the backend for authentication.
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

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("employeesUpdate", handleEmployeesUpdate);
    socket.on("proximityUpdate", handleProximityUpdate);
    socket.on("connect_error", handleConnectError);

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

      // Disconnect only when the logged-in session changes,
      // not when navigating between application pages.
      socket.disconnect();
    };
  }, [user]);

  // Handle successful login.
  function handleLogin(userData) {
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

    setUser(null);
    setCurrentPage("VirtualOffice");

    setConnected(false);
    setEmployees([]);
    setNearbyEmployees([]);

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

  // Show login page when no user is authenticated.
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  const pageProps = {
    user,
    currentPage,
    onNavigate: handleNavigate,
    onLogout: handleLogout,
    onBack: () => handleNavigate("VirtualOffice"),

    // Shared live employee information.
    onlineEmployees: employees,
    connected,
  };

  let currentPageComponent;

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
      currentPageComponent = <VirtualOffice {...pageProps} />;
      break;
  }

  return (
    <AppStatusContext.Provider
      value={{
        connected,
        employees,
        nearbyEmployees,
        voiceRange,
      }}
    >
      {currentPageComponent}
    </AppStatusContext.Provider>
  );
}

export default App;