
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
import officeFloor from "../assets/office-floor.png";

// Public STUN server helps peers discover direct connection paths.
const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
  ],
};

function VirtualOffice({ user, onNavigate, onLogout }) {
  // Shared application data — App.jsx manages the Socket.IO connection.
  const {
    employees = [],
    connected = false,
    nearbyEmployees = [],
    voiceRange = 120,
  } = useContext(AppStatusContext);

  const [myEmployeeId, setMyEmployeeId] = useState("");

  const [voiceJoined, setVoiceJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [remoteStreams, setRemoteStreams] = useState({});

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
    nearbyRef.current = nearbyEmployees;
  }, [nearbyEmployees]);

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
      setVoiceError("Could not connect to a nearby colleague.");
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
            signal: { type: "voice-ready-ack" },
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
            pendingCandidatesRef.current.set(fromSocketId, queued);
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
  }, [closePeerConnection, createPeerConnection, startOffer]);

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

    // When returning from another page, the shared socket may
    // already be connected. Set the current employee ID immediately.
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);

      // Stop this page's voice resources, but DO NOT disconnect
      // the shared Socket.IO connection managed by App.jsx.
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
  // HANDLE PROXIMITY CHANGES FOR VOICE
  // ==========================================

  useEffect(() => {
    const nearbyIds = new Set(
      nearbyEmployees.map((employee) => employee.socketId)
    );

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

    if (voiceEnabledRef.current && socket.connected) {
      nearbyEmployees.forEach((employee) => {
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
          signal: { type: "voice-ready" },
        });
      });
    }
  }, [nearbyEmployees, closePeerConnection]);

  // ==========================================
  // JOIN VOICE
  // ==========================================

  async function joinVoice() {
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
          signal: { type: "voice-ready" },
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
  }

  // ==========================================
  // LEAVE VOICE
  // ==========================================

  function leaveVoice() {
    voiceEnabledRef.current = false;

    for (const peerId of peerConnectionsRef.current.keys()) {
      if (socket.connected) {
        socket.emit("voiceSignal", {
          targetSocketId: peerId,
          signal: { type: "voice-left" },
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
  }

  // ==========================================
  // MUTE / UNMUTE
  // ==========================================

  function toggleMute() {
    const stream = localStreamRef.current;

    if (!stream) return;

    const nextMuted = !muted;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });

    setMuted(nextMuted);
  }

  // ==========================================
  // KEYBOARD MOVEMENT
  // ==========================================

  useEffect(() => {
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

      const currentEmployee = employees.find(
        (employee) => employee.socketId === myEmployeeId
      );

      if (!currentEmployee || !socket.connected) return;

      event.preventDefault();

      const speed = 12;
      let { x, y } = currentEmployee;

      if (key === "w" || key === "arrowup") y -= speed;
      if (key === "s" || key === "arrowdown") y += speed;
      if (key === "a" || key === "arrowleft") x -= speed;
      if (key === "d" || key === "arrowright") x += speed;

      x = Math.max(20, Math.min(780, x));
      y = Math.max(20, Math.min(480, y));

      socket.emit("employeeMove", { x, y });
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [employees, myEmployeeId]);

  // ==========================================
  // VIRTUAL OFFICE UI
  // ==========================================

  return (
    <main className="app">
      <style>{`
        .avatar-voice-wrapper {
          position: relative;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          isolation: isolate;
          z-index: 1;
        }

        .voice-range-circle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--voice-range-size);
          height: var(--voice-range-size);
          transform: translate(-50%, -50%);
          border: 1.5px solid rgba(45, 210, 255, 0.65);
          border-radius: 50%;
          background:
            radial-gradient(
              circle,
              rgba(0, 190, 255, 0.02) 35%,
              rgba(0, 150, 255, 0.045) 70%,
              rgba(0, 210, 255, 0.10) 100%
            );
          box-shadow:
            0 0 12px rgba(0, 180, 255, 0.16),
            0 0 28px rgba(0, 160, 255, 0.10),
            inset 0 0 22px rgba(0, 190, 255, 0.08);
          pointer-events: none;
          z-index: 0;
          animation: oceanBoundary 5s ease-in-out infinite;
        }

        .voice-range-circle::before {
          content: "";
          position: absolute;
          inset: 0;
          border: 2px solid rgba(0, 210, 255, 0.55);
          border-radius: 48% 52% 55% 45% / 52% 45% 55% 48%;
          background: transparent;
          box-shadow:
            0 0 12px rgba(0, 190, 255, 0.22),
            inset 0 0 12px rgba(0, 190, 255, 0.06);
          animation: oceanWaveOne 7s ease-in-out infinite;
        }

        .voice-range-circle::after {
          content: "";
          position: absolute;
          inset: 5px;
          border: 1.5px solid rgba(40, 150, 255, 0.48);
          border-radius: 55% 45% 48% 52% / 45% 55% 45% 55%;
          background:
            radial-gradient(
              circle,
              transparent 65%,
              rgba(0, 190, 255, 0.035) 100%
            );
          animation: oceanWaveTwo 9s ease-in-out infinite;
        }

        .ocean-wave {
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--voice-range-size);
          height: var(--voice-range-size);
          border: 1px solid rgba(0, 200, 255, 0.38);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 0;
        }

        .ocean-wave.wave-one {
          animation: sonarWave 4s ease-out infinite;
        }

        .ocean-wave.wave-two {
          animation: sonarWave 4s ease-out infinite 1.3s;
          border-color: rgba(30, 145, 255, 0.42);
        }

        .ocean-wave.wave-three {
          animation: sonarWave 4s ease-out infinite 2.6s;
          border-color: rgba(0, 220, 255, 0.32);
        }

        .ocean-glow {
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--voice-range-size);
          height: var(--voice-range-size);
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            rgba(0, 210, 255, 0.08) 45deg,
            transparent 100deg,
            rgba(30, 100, 255, 0.06) 180deg,
            transparent 240deg,
            rgba(0, 210, 255, 0.07) 300deg,
            transparent 360deg
          );
          filter: blur(5px);
          animation: oceanRotate 14s linear infinite;
          pointer-events: none;
          z-index: 0;
        }

        .avatar-voice-wrapper .avatar {
          position: relative;
          z-index: 2;
          box-shadow:
            0 0 0 2px rgba(0, 210, 255, 0.18),
            0 0 12px rgba(0, 180, 255, 0.18);
        }

        @keyframes oceanBoundary {
          0%, 100% {
            opacity: 0.65;
            border-color: rgba(45, 210, 255, 0.45);
            box-shadow:
              0 0 10px rgba(0, 180, 255, 0.12),
              inset 0 0 15px rgba(0, 190, 255, 0.04);
          }

          50% {
            opacity: 1;
            border-color: rgba(0, 225, 255, 0.85);
            box-shadow:
              0 0 20px rgba(0, 200, 255, 0.24),
              0 0 35px rgba(0, 150, 255, 0.12),
              inset 0 0 25px rgba(0, 190, 255, 0.12);
          }
        }

        @keyframes oceanWaveOne {
          0%, 100% {
            border-radius: 48% 52% 55% 45% / 52% 45% 55% 48%;
            transform: scale(0.98) rotate(0deg);
          }

          25% {
            border-radius: 55% 45% 48% 52% / 45% 55% 48% 52%;
            transform: scale(1.005) rotate(4deg);
          }

          50% {
            border-radius: 45% 55% 52% 48% / 55% 45% 52% 48%;
            transform: scale(0.99) rotate(8deg);
          }

          75% {
            border-radius: 52% 48% 45% 55% / 48% 52% 55% 45%;
            transform: scale(1.01) rotate(4deg);
          }
        }

        @keyframes oceanWaveTwo {
          0%, 100% {
            border-radius: 55% 45% 48% 52% / 45% 55% 45% 55%;
            transform: scale(0.96) rotate(0deg);
            opacity: 0.4;
          }

          50% {
            border-radius: 45% 55% 55% 45% / 55% 45% 52% 48%;
            transform: scale(1.025) rotate(-10deg);
            opacity: 0.85;
          }
        }

        @keyframes sonarWave {
          0% {
            transform: translate(-50%, -50%) scale(0.94);
            opacity: 0.65;
          }

          70% {
            opacity: 0.2;
          }

          100% {
            transform: translate(-50%, -50%) scale(1.045);
            opacity: 0;
          }
        }

        @keyframes oceanRotate {
          from {
            transform: translate(-50%, -50%) rotate(0deg);
          }

          to {
            transform: translate(-50%, -50%) rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .voice-range-circle,
          .voice-range-circle::before,
          .voice-range-circle::after,
          .ocean-wave,
          .ocean-glow {
            animation: none !important;
          }
        }
      `}</style>

      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="VirtualOffice"
      />

      <section className="office-stage">
        <img
          className="office-background"
          src={officeFloor}
          alt="ProxiSpeak virtual office floor plan"
          draggable="false"
        />

        <div className="player-layer">
          {employees.map((employee) => {
            const isMe = employee.socketId === myEmployeeId;

            const initials = (employee.name || "Guest")
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            const isNearby = nearbyEmployees.some(
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
                <div className="avatar-voice-wrapper">
                  <div
                    className="voice-range-circle"
                    style={{
                      "--voice-range-size": `${voiceRange * 2}px`,
                    }}
                    title={`Voice range: ${voiceRange}px`}
                  />

                  <div
                    className="ocean-wave wave-one"
                    style={{
                      "--voice-range-size": `${voiceRange * 2}px`,
                    }}
                  />

                  <div
                    className="ocean-wave wave-two"
                    style={{
                      "--voice-range-size": `${voiceRange * 2}px`,
                    }}
                  />

                  <div
                    className="ocean-wave wave-three"
                    style={{
                      "--voice-range-size": `${voiceRange * 2}px`,
                    }}
                  />

                  <div
                    className="ocean-glow"
                    style={{
                      "--voice-range-size": `${voiceRange * 2}px`,
                    }}
                  />

                  <div
                    className={`avatar ${
                      isMe ? "my-avatar" : "other-avatar"
                    }`}
                    title={
                      isNearby
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

      {/* Voice controls */}
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "10px",
          padding: "14px",
        }}
      >
        {!voiceJoined ? (
          <button
            type="button"
            onClick={joinVoice}
            disabled={!connected}
            style={{
              padding: "10px 16px",
              cursor: connected ? "pointer" : "not-allowed",
            }}
          >
            🎙️ Join Voice
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              style={{ padding: "10px 16px", cursor: "pointer" }}
            >
              {muted ? "🔇 Unmute" : "🎙️ Mute"}
            </button>

            <button
              type="button"
              onClick={leaveVoice}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
              }}
            >
              Leave Voice
            </button>
          </>
        )}

        <span>
          {voiceJoined
            ? muted
              ? "Microphone muted"
              : "Voice enabled"
            : "Not in voice chat"}
        </span>

        <span>
          Audio connections: {Object.keys(remoteStreams).length}
        </span>

        {voiceError && (
          <span
            role="alert"
            style={{ color: "crimson", flexBasis: "100%" }}
          >
            {voiceError}
          </span>
        )}

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
      </section>
    </main>
  );
}

export default VirtualOffice;
