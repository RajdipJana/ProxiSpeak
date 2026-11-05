
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
    voicePeers = [],
    voiceRange = 120,
    voiceRangePreference = voiceRange,
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

  // Nearby employees are used for visual status only.
  const roomNearbyEmployees = nearbyEmployees.filter(
    (employee) => employee.currentRoom === activeRoom
  );

  // Voice peers are supplied by the server after its
  // mutual voice-range permission checks.
  const roomVoicePeers = voicePeers.filter(
    (employee) => employee.currentRoom === activeRoom
  );

  // Current user's selected range.
  const myVoiceRange = voiceRangePreference === 75 ? 75 : 120;

  // WebRTC refs
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  const offerInProgressRef = useRef(new Set());
  const voicePeersRef = useRef([]);
  const voiceEnabledRef = useRef(false);
  const announcedPeersRef = useRef(new Set());

  // Remote audio refs
  const audioElementsRef = useRef(new Map());
  const audioRefCallbacksRef = useRef(new Map());

  // Keep the latest permitted voice peers available.
  useEffect(() => {
    voicePeersRef.current = roomVoicePeers;
  }, [roomVoicePeers]);

  // ==========================================
  // STABLE AUDIO ELEMENT REFS
  // ==========================================

  const getAudioRef = useCallback((peerId) => {
    if (!audioRefCallbacksRef.current.has(peerId)) {
      const callback = (element) => {
        if (element) {
          audioElementsRef.current.set(peerId, element);
        } else {
          audioElementsRef.current.delete(peerId);
        }
      };

      audioRefCallbacksRef.current.set(peerId, callback);
    }

    return audioRefCallbacksRef.current.get(peerId);
  }, []);

  // ==========================================
  // CALCULATE REMOTE AUDIO VOLUME
  // ==========================================

  const getPeerTargetVolume = useCallback(
    (peerId) => {
      // Meeting and conference rooms always use full volume.
      if (activeRoom !== "workspace") {
        return 1;
      }

      const peer = roomVoicePeers.find(
        (employee) => employee.socketId === peerId
      );

      // No current permission means no audio.
      if (!peer) return 0;

      const peerVoiceRange =
        peer.voiceRange === 75 ? 75 : 120;

      // The server already enforces this mutual restriction.
      // Keep a client-side check as an additional safeguard.
      const mutualRange = Math.min(
        myVoiceRange,
        peerVoiceRange
      );

      const distance = Number(peer.distance);

      if (!Number.isFinite(distance)) {
        return mutualRange === 75 ? 1 : 0;
      }

      if (distance > mutualRange) {
        return 0;
      }

      // If either employee selected 75px, audio is full
      // volume inside that mutual range.
      if (mutualRange === 75) {
        return 1;
      }

      // Both employees selected 120px.
      // Full volume from 0px to 75px.
      if (distance <= 75) {
        return 1;
      }

      // Smoothly fade from 100% at 75px to 0% at 120px.
      if (distance >= 120) {
        return 0;
      }

      return Math.max(
        0,
        Math.min(1, (120 - distance) / 45)
      );
    },
    [activeRoom, roomVoicePeers, myVoiceRange]
  );

  // ==========================================
  // ATTACH REMOTE STREAMS TO AUDIO ELEMENTS
  // ==========================================

  useEffect(() => {
    Object.entries(remoteStreams).forEach(
      ([peerId, stream]) => {
        const audioElement =
          audioElementsRef.current.get(peerId);

        if (!audioElement) return;

        if (audioElement.srcObject !== stream) {
          audioElement.srcObject = stream;

          // Never expose a new stream at full volume
          // before its correct range volume is applied.
          audioElement.volume = 0;

          audioElement.play().catch((error) => {
            console.warn(
              "Audio playback needs browser permission:",
              error
            );
          });
        }
      }
    );
  }, [remoteStreams]);

  // ==========================================
  // SMOOTH AUDIO VOLUME ANIMATION
  // ==========================================

  useEffect(() => {
    if (audioElementsRef.current.size === 0) return;

    let animationFrameId;

    function animateAudioVolume() {
      audioElementsRef.current.forEach(
        (audioElement, peerId) => {
          const targetVolume =
            getPeerTargetVolume(peerId);

          const currentVolume = audioElement.volume;
          const difference = targetVolume - currentVolume;

          // Smoothly approach the target volume.
          // This avoids sudden audio level changes.
          if (Math.abs(difference) < 0.005) {
            audioElement.volume = targetVolume;
          } else {
            audioElement.volume =
              currentVolume + difference * 0.12;
          }
        }
      );

      animationFrameId =
        requestAnimationFrame(animateAudioVolume);
    }

    animationFrameId =
      requestAnimationFrame(animateAudioVolume);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    remoteStreams,
    getPeerTargetVolume,
  ]);

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

  const createPeerConnection = useCallback(
    (peerId) => {
      const existing =
        peerConnectionsRef.current.get(peerId);

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
    },
    [closePeerConnection]
  );

  // ==========================================
  // START AN OUTGOING WEBRTC OFFER
  // ==========================================

  const startOffer = useCallback(
    async (peerId) => {
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
        console.error(
          "Could not start voice connection:",
          error
        );

        setVoiceError(
          "Could not connect to a colleague."
        );
      } finally {
        offerInProgressRef.current.delete(peerId);
      }
    },
    [createPeerConnection]
  );

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
          await pc.setRemoteDescription(
            signal.description
          );

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
          if (pc.signalingState !== "have-local-offer") {
            return;
          }

          await pc.setRemoteDescription(
            signal.description
          );

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
        console.error(
          "WebRTC signaling error:",
          error
        );

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
    const permittedPeerIds = new Set(
      roomVoicePeers.map(
        (employee) => employee.socketId
      )
    );

    // Close connections that are no longer permitted
    // by the server's mutual voice-range calculation.
    for (const peerId of peerConnectionsRef.current.keys()) {
      if (!permittedPeerIds.has(peerId)) {
        if (socket.connected) {
          socket.emit("voiceSignal", {
            targetSocketId: peerId,
            signal: {
              type: "voice-left",
            },
          });
        }

        closePeerConnection(peerId);
      }
    }

    for (const peerId of announcedPeersRef.current) {
      if (!permittedPeerIds.has(peerId)) {
        announcedPeersRef.current.delete(peerId);
      }
    }

    // Announce voice availability only to permitted peers.
    if (voiceEnabledRef.current && socket.connected) {
      roomVoicePeers.forEach((employee) => {
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
    roomVoicePeers,
    activeRoom,
    closePeerConnection,
  ]);

  // ==========================================
  // JOIN VOICE
  // ==========================================

  const joinVoice = useCallback(async () => {
    if (!socket.connected) {
      setVoiceError(
        "Connect to the virtual office first."
      );
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

      const stream =
        await navigator.mediaDevices.getUserMedia({
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

      // Announce only to peers permitted by the server.
      voicePeersRef.current.forEach((employee) => {
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
      console.error(
        "Microphone access failed:",
        error
      );

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

  const handleOfficeDoubleClick = useCallback(
    (event) => {
      if (!isActive || !socket.connected) return;

      const currentEmployee = roomEmployees.find(
        (employee) => employee.socketId === myEmployeeId
      );

      if (!currentEmployee) return;

      const rect =
        event.currentTarget.getBoundingClientRect();

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

      stopMouseMovement();

      const startingPosition =
        mousePositionRef.current || {
          x: currentEmployee.x,
          y: currentEmployee.y,
        };

      let currentX = startingPosition.x;
      let currentY = startingPosition.y;

      let previousTimestamp = 0;
      let lastEmitTimestamp = 0;

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

        const movementStep =
          movementSpeed * deltaTime;

        if (
          distance <= movementStep ||
          distance < 0.5
        ) {
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

        currentX +=
          (differenceX / distance) * movementStep;

        currentY +=
          (differenceY / distance) * movementStep;

        mousePositionRef.current = {
          x: currentX,
          y: currentY,
        };

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
    },
    [
      isActive,
      roomEmployees,
      myEmployeeId,
      stopMouseMovement,
    ]
  );

  // ==========================================
  // CLEAN UP MOUSE MOVEMENT
  // ==========================================

  useEffect(() => {
    stopMouseMovement();
    mousePositionRef.current = null;

    return () => {
      stopMouseMovement();
    };
  }, [
    activeRoom,
    isActive,
    stopMouseMovement,
  ]);

  // ==========================================
  // KEYBOARD MOVEMENT
  // ==========================================

  useEffect(() => {
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
          ["INPUT", "TEXTAREA"].includes(
            event.target.tagName
          ) ||
          event.target.isContentEditable
        )
      ) {
        return;
      }

      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return;
      }

      const currentEmployee = roomEmployees.find(
        (employee) => employee.socketId === myEmployeeId
      );

      if (!currentEmployee || !socket.connected) return;

      stopMouseMovement();

      event.preventDefault();

      const speed = 12;

      let { x, y } =
        mousePositionRef.current || currentEmployee;

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
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
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
            const isMe =
              employee.socketId === myEmployeeId;

            const initials = (employee.name || "Guest")
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            const isNearby = roomNearbyEmployees.some(
              (nearby) =>
                nearby.socketId === employee.socketId
            );

            // Each employee uses their own selected range.
            const employeeVoiceRange =
              employee.voiceRange === 75 ? 75 : 120;

            // Diameter = 2 × radius.
            // The office is 800 virtual pixels wide.
            const voiceCircleDiameter =
              (employeeVoiceRange * 2 / 800) * 100;

            return (
              <div
                key={
                  employee.socketId || employee.userId
                }
                className="player"
                style={{
                  left: `${9.2 + (employee.x / 800) * 81}%`,
                  top: `${6.5 + (employee.y / 500) * 86}%`,
                }}
              >
                <div
                  className="avatar-voice-wrapper"
                  style={{
                    "--voice-range-size":
                      `${voiceCircleDiameter}cqi`,
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
                      isMe
                        ? "my-avatar"
                        : "other-avatar"
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
        {Object.entries(remoteStreams).map(
          ([peerId, stream]) => (
            <audio
              key={peerId}
              ref={getAudioRef(peerId)}
              autoPlay
              playsInline
              data-peer-id={peerId}
            />
          )
        )}
      </div>
    </main>
  );
}

export default VirtualOffice;
