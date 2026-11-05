
import Header from "../components/Header";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
} from "react";
import socket from "../socket";
import AppStatusContext from "../AppStatusContext";
import "../App.css";
import "./VirtualOffice.css";

import workspaceFloor from "../assets/MainOffice.png";
import conferenceFloor from "../assets/ConferenceRoom.png";
import meetingRoom1Floor from "../assets/MeetingRoom1.png";
import meetingRoom2Floor from "../assets/MeetingRoom2.png";

// Room backgrounds
const ROOM_BACKGROUNDS = {
  workspace: workspaceFloor,
  conference: conferenceFloor,
  meeting1: meetingRoom1Floor,
  meeting2: meetingRoom2Floor,
};

// Public STUN server helps peers discover direct connection paths.
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

function VirtualOffice({
  user,
  onNavigate,
  onLogout,
  isActive = true,
  onVoiceControlsChange,
}) {
  const {
    employees = [],
    connected = false,
    nearbyEmployees = [],
    voiceRange = 120,
    currentRoom = "workspace",
  } = useContext(AppStatusContext);

  const [myEmployeeId, setMyEmployeeId] = useState("");

  const [voiceJoined, setVoiceJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [remoteStreams, setRemoteStreams] = useState({});

  // Mouse-based movement refs
  const mouseMovementRef = useRef(null);
  const mousePositionRef = useRef(null);

  // Room configuration
  const activeRoom = ROOM_BACKGROUNDS[currentRoom]
    ? currentRoom
    : "workspace";

  const officeFloor = ROOM_BACKGROUNDS[activeRoom];

  const isGroupRoom = activeRoom !== "workspace";

  // Only show employees who belong to this room.
  const roomEmployees = employees.filter(
    (employee) => employee.currentRoom === activeRoom
  );

  // The backend supplies room-specific nearby employees.
  const roomNearbyEmployees = nearbyEmployees.filter(
    (employee) =>
      employee.currentRoom === activeRoom
  );

  // WebRTC refs
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const offerInProgressRef = useRef(new Set());
  const nearbyRef = useRef([]);
  const voiceEnabledRef = useRef(false);
  const announcedPeersRef = useRef(new Set());

  // Keep the latest nearby employees available to voice functions.
  useEffect(() => {
    nearbyRef.current = roomNearbyEmployees;
  }, [roomNearbyEmployees]);

  // ==========================================
  // CLOSE A PEER CONNECTION
  // ==========================================

  const closePeerConnection = useCallback((peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);

    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();

      peerConnectionsRef.current.delete(peerId);
    }

    pendingCandidatesRef.current.delete(peerId);
    offerInProgressRef.current.delete(peerId);

    setRemoteStreams((previous) => {
      if (!previous[peerId]) return previous;

      const updated = { ...previous };
      delete updated[peerId];

      return updated;
    });
  }, []);

  // ==========================================
  // CREATE A WEBRTC PEER CONNECTION
  // ==========================================

  const createPeerConnection = useCallback((peerId) => {
    const existing = peerConnectionsRef.current.get(peerId);

    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const localStream = localStreamRef.current;

    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket.connected) {
        socket.emit("voiceSignal", {
          targetSocketId: peerId,
          signal: {
            type: "candidate",
            candidate: event.candidate,
          },
        });
      }
    };

    pc.ontrack = (event) => {
      const stream =
        event.streams?.[0] ||
        new MediaStream([event.track]);

      setRemoteStreams((previous) => ({
        ...previous,
        [peerId]: stream,
      }));
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        closePeerConnection(peerId);
      }
    };

    peerConnectionsRef.current.set(peerId, pc);

    return pc;
  }, [closePeerConnection]);

  // ==========================================
  // START AN OUTGOING WEBRTC OFFER
  // ==========================================

  const startOffer = useCallback(async (peerId) => {
    if (
      !localStreamRef.current ||
      !voiceEnabledRef.current ||
      !socket.connected ||
      socket.id.localeCompare(peerId) >= 0 ||
      offerInProgressRef.current.has(peerId)
    ) {
      return;
    }

    const pc = createPeerConnection(peerId);

    if (pc.signalingState !== "stable") return;

    offerInProgressRef.current.add(peerId);

    try {
      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);

      if (
        !voiceEnabledRef.current ||
        !socket.connected ||
        peerConnectionsRef.current.get(peerId) !== pc
      ) {
        return;
      }

      socket.emit("voiceSignal", {
        targetSocketId: peerId,
        signal: {
          type: "offer",
          description: pc.localDescription,
        },
      });
    } catch (error) {
      console.error("Could not start voice connection:", error);

      setVoiceError(
        "Could not connect to a colleague."
      );
    } finally {
      offerInProgressRef.current.delete(peerId);
    }
  }, [createPeerConnection]);

  // ==========================================
  // HANDLE INCOMING WEBRTC SIGNALS
  // ==========================================

  useEffect(() => {
    async function handleVoiceSignal({
      fromSocketId,
      signal,
    } = {}) {
      if (!fromSocketId || !signal) return;

      if (signal.type === "voice-left") {
        closePeerConnection(fromSocketId);
        announcedPeersRef.current.delete(fromSocketId);

        return;
      }

      if (signal.type === "voice-ready") {
        if (
          voiceEnabledRef.current &&
          localStreamRef.current &&
          socket.connected
        ) {
          socket.emit("voiceSignal", {
            targetSocketId: fromSocketId,
            signal: {
              type: "voice-ready-ack",
            },
          });

          if (socket.id.localeCompare(fromSocketId) < 0) {
            await startOffer(fromSocketId);
          }
        }

        return;
      }

      if (signal.type === "voice-ready-ack") {
        if (
          voiceEnabledRef.current &&
          localStreamRef.current &&
          socket.connected &&
          socket.id.localeCompare(fromSocketId) < 0
        ) {
          await startOffer(fromSocketId);
        }

        return;
      }

      if (
        !voiceEnabledRef.current ||
        !localStreamRef.current
      ) {
        return;
      }

      try {
        const pc = createPeerConnection(fromSocketId);

        if (signal.type === "offer") {
          await pc.setRemoteDescription(signal.description);

          const queued =
            pendingCandidatesRef.current.get(fromSocketId) || [];

          for (const candidate of queued) {
            await pc.addIceCandidate(candidate);
          }

          pendingCandidatesRef.current.delete(fromSocketId);

          const answer = await pc.createAnswer();

          await pc.setLocalDescription(answer);

          socket.emit("voiceSignal", {
            targetSocketId: fromSocketId,
            signal: {
              type: "answer",
              description: pc.localDescription,
            },
          });
        } else if (signal.type === "answer") {
          if (pc.signalingState !== "have-local-offer") return;

          await pc.setRemoteDescription(signal.description);

          const queued =
            pendingCandidatesRef.current.get(fromSocketId) || [];

          for (const candidate of queued) {
            await pc.addIceCandidate(candidate);
          }

          pendingCandidatesRef.current.delete(fromSocketId);
        } else if (signal.type === "candidate") {
          const candidate = signal.candidate;

          if (!candidate) return;

          if (pc.remoteDescription) {
            await pc.addIceCandidate(candidate);
          } else {
            const queued =
              pendingCandidatesRef.current.get(fromSocketId) || [];

            queued.push(candidate);

            pendingCandidatesRef.current.set(
              fromSocketId,
              queued
            );
          }
        }
      } catch (error) {
        console.error("WebRTC signaling error:", error);

        setVoiceError(
          "A voice connection failed. Try leaving and rejoining voice."
        );
      }
    }

    socket.on("voiceSignal", handleVoiceSignal);

    return () => {
      socket.off("voiceSignal", handleVoiceSignal);
    };
  }, [
    closePeerConnection,
    createPeerConnection,
    startOffer,
  ]);

  // ==========================================
  // SHARED SOCKET — OFFICE SESSION
  // ==========================================

  useEffect(() => {
    function handleConnect() {
      setMyEmployeeId(socket.id);
    }

    function handleDisconnect() {
      setMyEmployeeId("");

      voiceEnabledRef.current = false;

      setVoiceJoined(false);
      setMuted(false);

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      localStreamRef.current = null;

      for (const peerId of peerConnectionsRef.current.keys()) {
        closePeerConnection(peerId);
      }

      announcedPeersRef.current.clear();
      pendingCandidatesRef.current.clear();
      offerInProgressRef.current.clear();

      setRemoteStreams({});
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);

      // This cleanup happens when the persistent
      // VirtualOffice component actually unmounts.
      voiceEnabledRef.current = false;

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      localStreamRef.current = null;

      for (const pc of peerConnectionsRef.current.values()) {
        pc.close();
      }

      peerConnectionsRef.current.clear();
      pendingCandidatesRef.current.clear();
      announcedPeersRef.current.clear();
      offerInProgressRef.current.clear();

      setRemoteStreams({});
    };
  }, [closePeerConnection]);

  // ==========================================
  // ROOM CHANGE — CLEAN UP OLD VOICE CONNECTIONS
  // ==========================================

  useEffect(() => {
    // A room transition ends all peer connections
    // from the previous room.
    for (const peerId of peerConnectionsRef.current.keys()) {
      closePeerConnection(peerId);
    }

    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    offerInProgressRef.current.clear();
    announcedPeersRef.current.clear();

    setRemoteStreams({});

    // Keep the microphone active if the user was
    // already in voice. The next effect will connect
    // to colleagues in the new room.
  }, [activeRoom, closePeerConnection]);

  // ==========================================
  // HANDLE PROXIMITY / GROUP VOICE CHANGES
  // ==========================================

  useEffect(() => {
    const nearbyIds = new Set(
      roomNearbyEmployees.map((employee) => employee.socketId)
    );

    // Close connections to employees who are no longer
    // valid voice participants in this room.
    for (const peerId of peerConnectionsRef.current.keys()) {
      if (!nearbyIds.has(peerId)) {
        closePeerConnection(peerId);
      }
    }

    for (const peerId of announcedPeersRef.current) {
      if (!nearbyIds.has(peerId)) {
        announcedPeersRef.current.delete(peerId);
      }
    }

    // Announce voice availability to the current room.
    if (voiceEnabledRef.current && socket.connected) {
      roomNearbyEmployees.forEach((employee) => {
        const peerId = employee.socketId;

        if (
          !peerId ||
          peerId === socket.id ||
          announcedPeersRef.current.has(peerId)
        ) {
          return;
        }

        announcedPeersRef.current.add(peerId);

        socket.emit("voiceSignal", {
          targetSocketId: peerId,
          signal: {
            type: "voice-ready",
          },
        });
      });
    }
  }, [
    roomNearbyEmployees,
    activeRoom,
    closePeerConnection,
  ]);

  // ==========================================
  // JOIN VOICE
  // ==========================================

  const joinVoice = useCallback(async () => {
    if (!socket.connected) {
      setVoiceError("Connect to the virtual office first.");
      return;
    }

    if (voiceEnabledRef.current) return;

    setVoiceError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access is unavailable. Use localhost or HTTPS."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      if (!socket.connected) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = stream;
      voiceEnabledRef.current = true;

      stream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      setMuted(false);
      setVoiceJoined(true);

      announcedPeersRef.current.clear();

      nearbyRef.current.forEach((employee) => {
        const peerId = employee.socketId;

        if (!peerId || peerId === socket.id) return;

        announcedPeersRef.current.add(peerId);

        socket.emit("voiceSignal", {
          targetSocketId: peerId,
          signal: {
            type: "voice-ready",
          },
        });
      });
    } catch (error) {
      console.error("Microphone access failed:", error);

      setVoiceError(
        error.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access in your browser."
          : error.message || "Could not access the microphone."
      );
    }
  }, []);

  // ==========================================
  // LEAVE VOICE
  // ==========================================

  const leaveVoice = useCallback(() => {
    voiceEnabledRef.current = false;

    for (const peerId of peerConnectionsRef.current.keys()) {
      if (socket.connected) {
        socket.emit("voiceSignal", {
          targetSocketId: peerId,
          signal: {
            type: "voice-left",
          },
        });
      }
    }

    for (const pc of peerConnectionsRef.current.values()) {
      pc.close();
    }

    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    announcedPeersRef.current.clear();
    offerInProgressRef.current.clear();

    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });

    localStreamRef.current = null;

    setRemoteStreams({});
    setVoiceJoined(false);
    setMuted(false);
    setVoiceError("");
  }, []);

  // ==========================================
  // MUTE / UNMUTE
  // ==========================================

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;

    if (!stream) return;

    const nextMuted = !muted;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setMuted(nextMuted);
  }, [muted]);

  // ==========================================
  // SHARE VOICE CONTROLS WITH APP.JSX
  // ==========================================

  useEffect(() => {
    onVoiceControlsChange?.({
      voiceJoined,
      muted,
      voiceError,
      audioConnections: Object.keys(remoteStreams).length,
      voiceDisabled: !connected,

      onJoinVoice: joinVoice,
      onToggleMute: toggleMute,
      onLeaveVoice: leaveVoice,
    });
  }, [
    onVoiceControlsChange,
    voiceJoined,
    muted,
    voiceError,
    remoteStreams,
    connected,
    joinVoice,
    toggleMute,
    leaveVoice,
  ]);

  // ==========================================
  // STOP MOUSE MOVEMENT
  // ==========================================

  const stopMouseMovement = useCallback(() => {
    if (mouseMovementRef.current !== null) {
      cancelAnimationFrame(mouseMovementRef.current);
      mouseMovementRef.current = null;
    }
  }, []);

  // ==========================================
  // MOUSE DOUBLE-CLICK MOVEMENT
  // ==========================================

  const handleOfficeDoubleClick = useCallback((event) => {
    if (!isActive || !socket.connected) return;

    const currentEmployee = roomEmployees.find(
      (employee) => employee.socketId === myEmployeeId
    );

    if (!currentEmployee) return;

    const rect = event.currentTarget.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    // Convert clicked screen position to office coordinates.
    const clickX =
      ((event.clientX - rect.left) / rect.width) * 100;

    const clickY =
      ((event.clientY - rect.top) / rect.height) * 100;

    const targetX = Math.max(
      20,
      Math.min(780, ((clickX - 9.2) / 81) * 800)
    );

    const targetY = Math.max(
      20,
      Math.min(480, ((clickY - 6.5) / 86) * 500)
    );

    // Stop the previous movement if a new destination is selected.
    stopMouseMovement();

    const startingPosition = mousePositionRef.current || {
      x: currentEmployee.x,
      y: currentEmployee.y,
    };

    let currentX = startingPosition.x;
    let currentY = startingPosition.y;

    let previousTimestamp = 0;
    let lastEmitTimestamp = 0;

    // Movement speed in office coordinates per second.
    const movementSpeed = 260;

    function animateMovement(timestamp) {
      if (!socket.connected) {
        mouseMovementRef.current = null;
        return;
      }

      if (!previousTimestamp) {
        previousTimestamp = timestamp;
      }

      const deltaTime = Math.min(
        (timestamp - previousTimestamp) / 1000,
        0.05
      );

      previousTimestamp = timestamp;

      const differenceX = targetX - currentX;
      const differenceY = targetY - currentY;

      const distance = Math.sqrt(
        differenceX * differenceX +
        differenceY * differenceY
      );

      const movementStep = movementSpeed * deltaTime;

      // Reached destination.
      if (distance <= movementStep || distance < 0.5) {
        currentX = targetX;
        currentY = targetY;

        mousePositionRef.current = {
          x: currentX,
          y: currentY,
        };

        socket.emit("employeeMove", {
          x: currentX,
          y: currentY,
        });

        mouseMovementRef.current = null;
        return;
      }

      // Move gradually towards the destination.
      currentX += (differenceX / distance) * movementStep;
      currentY += (differenceY / distance) * movementStep;

      mousePositionRef.current = {
        x: currentX,
        y: currentY,
      };

      // Broadcast approximately 30 updates per second.
      if (timestamp - lastEmitTimestamp >= 33) {
        socket.emit("employeeMove", {
          x: currentX,
          y: currentY,
        });

        lastEmitTimestamp = timestamp;
      }

      mouseMovementRef.current =
        requestAnimationFrame(animateMovement);
    }

    mouseMovementRef.current =
      requestAnimationFrame(animateMovement);
  }, [
    isActive,
    roomEmployees,
    myEmployeeId,
    stopMouseMovement,
  ]);

  // ==========================================
  // CLEAN UP MOUSE MOVEMENT
  // ==========================================

  useEffect(() => {
    stopMouseMovement();
    mousePositionRef.current = null;

    return () => {
      stopMouseMovement();
    };
  }, [activeRoom, isActive, stopMouseMovement]);

  // ==========================================
  // KEYBOARD MOVEMENT
  // ==========================================

  useEffect(() => {
    // Do not allow office movement from other pages.
    if (!isActive) return;

    function handleKeyDown(event) {
      const key = event.key.toLowerCase();

      const allowedKeys = [
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ];

      if (!allowedKeys.includes(key)) return;

      if (
        event.target instanceof HTMLElement &&
        (
          ["INPUT", "TEXTAREA"].includes(event.target.tagName) ||
          event.target.isContentEditable
        )
      ) {
        return;
      }

      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const currentEmployee = roomEmployees.find(
        (employee) => employee.socketId === myEmployeeId
      );

      if (!currentEmployee || !socket.connected) return;

      // Keyboard input takes control from mouse movement.
      stopMouseMovement();

      event.preventDefault();

      const speed = 12;

      let { x, y } = mousePositionRef.current || currentEmployee;

      if (key === "w" || key === "arrowup") y -= speed;
      if (key === "s" || key === "arrowdown") y += speed;
      if (key === "a" || key === "arrowleft") x -= speed;
      if (key === "d" || key === "arrowright") x += speed;

      x = Math.max(20, Math.min(780, x));
      y = Math.max(20, Math.min(480, y));

      mousePositionRef.current = { x, y };

      socket.emit("employeeMove", { x, y });
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    roomEmployees,
    myEmployeeId,
    isActive,
    stopMouseMovement,
  ]);

  // ==========================================
  // VIRTUAL OFFICE UI
  // ==========================================

  return (
    <main className="app">
      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="VirtualOffice"
        currentRoom={activeRoom}
      />

      <section
        className="office-stage"
        onDoubleClick={handleOfficeDoubleClick}
      >
        <img
          className="office-background"
          src={officeFloor}
          alt={`${activeRoom} virtual office floor plan`}
          draggable="false"
        />

        <div className="player-layer">
          {roomEmployees.map((employee) => {
            const isMe = employee.socketId === myEmployeeId;

            const initials = (employee.name || "Guest")
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            const isNearby = roomNearbyEmployees.some(
              (nearby) => nearby.socketId === employee.socketId
            );

            return (
              <div
                key={employee.socketId || employee.userId}
                className="player"
                style={{
                  left: `${9.2 + (employee.x / 800) * 81}%`,
                  top: `${6.5 + (employee.y / 500) * 86}%`,
                }}
              >
                <div
                  className="avatar-voice-wrapper"
                  style={{
                    "--voice-range-size": `${(voiceRange * 200) / 1536}cqi`,
                  }}
                >
                  {/* Proximity visuals are only needed in Workspace. */}
                  {!isGroupRoom && (
                    <>

                      <div className="ocean-wave" />
                      <div className="ocean-wave" />
                      <div className="ocean-wave" />

                      <div className="ocean-glow" />
                    </>
                  )}

                  <div
                    className={`avatar ${
                      isMe ? "my-avatar" : "other-avatar"
                    }`}
                    title={
                      isGroupRoom
                        ? employee.name
                        : isNearby
                          ? `${employee.name} — nearby`
                          : employee.name
                    }
                  >
                    {initials}
                  </div>
                </div>

                <span className="player-name">
                  {isMe ? "You" : employee.name}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Remote audio elements stay mounted while navigating pages. */}
      <div className="office-audio-elements">
        {Object.entries(remoteStreams).map(([peerId, stream]) => (
          <audio
            key={peerId}
            autoPlay
            playsInline
            ref={(element) => {
              if (element && element.srcObject !== stream) {
                element.srcObject = stream;

                element.play().catch((error) => {
                  console.warn(
                    "Audio playback needs browser permission:",
                    error
                  );
                });
              }
            }}
          />
        ))}
      </div>
    </main>
  );
}

export default VirtualOffice;
