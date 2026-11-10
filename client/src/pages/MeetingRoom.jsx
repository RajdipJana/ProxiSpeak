
import { useCallback, useEffect, useRef, useState } from "react";
import Header from "../components/Header";
import socket from "../socket";
import "./MeetingRoom.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function MeetingRoom({
  user,
  meeting,
  onNavigate,
  onLogout,
  meetingExitRequest,
  onMeetingExitComplete,
}) {
  const meetingId = meeting?._id || meeting?.id;
  const token = user?.token;
  const currentEmployeeId = user?.employeeId;

  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const audioElementsRef = useRef(new Map());
  const screenVideoRef = useRef(null);
  const mountedRef = useRef(false);

  // Prevent duplicate exit requests.
  const leavingRef = useRef(false);
  const processedExitRequestRef = useRef(null);
  const exitRequestRef = useRef(null);

  const [participants, setParticipants] = useState([]);
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [muted, setMuted] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [remotePresenterSocketId, setRemotePresenterSocketId] =
    useState(null);
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [roomMessage, setRoomMessage] = useState("");
  const [leaving, setLeaving] = useState(false);

  const isHost =
    meeting?.hostEmployeeId === currentEmployeeId;

  // ==========================================
  // API REQUEST
  // ==========================================

  const apiRequest = useCallback(
    async (path, options = {}) => {
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
          data.message || data.error || "Request failed."
        );
      }

      return data;
    },
    [token]
  );

  // ==========================================
  // SEND WEBRTC SIGNAL
  // ==========================================

  const sendSignal = useCallback(
    (targetSocketId, signal) => {
      if (!socket.connected || !targetSocketId || !meetingId) {
        return;
      }

      socket.emit("meetingSignal", {
        meetingId,
        targetSocketId,
        signal,
      });
    },
    [meetingId]
  );

  // ==========================================
  // CLOSE PEER CONNECTION
  // ==========================================

  const closePeer = useCallback((socketId) => {
    const peer = peersRef.current.get(socketId);

    if (peer) {
      peersRef.current.delete(socketId);

      peer.connection.ontrack = null;
      peer.connection.onicecandidate = null;
      peer.connection.onnegotiationneeded = null;
      peer.connection.onconnectionstatechange = null;

      peer.connection.close();
    }

    remoteStreamsRef.current.delete(socketId);

    if (mountedRef.current) {
      setRemoteStreams((previous) =>
        previous.filter((item) => item.socketId !== socketId)
      );

      setParticipants((previous) =>
        previous.filter((item) => item.socketId !== socketId)
      );

      setRemotePresenterSocketId((current) =>
        current === socketId ? null : current
      );
    }
  }, []);

  // ==========================================
  // CREATE WEBRTC PEER
  // ==========================================

  const createPeer = useCallback(
    (remote) => {
      if (!remote?.socketId || remote.socketId === socket.id) {
        return null;
      }

      const existing = peersRef.current.get(remote.socketId);

      if (existing) {
        return existing;
      }

      const connection = new RTCPeerConnection(ICE_SERVERS);

      const peer = {
        connection,
        makingOffer: false,
        ignoreOffer: false,
        polite: String(socket.id) > String(remote.socketId),
        pendingCandidates: [],
      };

      peersRef.current.set(remote.socketId, peer);

      // Add microphone tracks.
      const localStream = localStreamRef.current;

      if (localStream) {
        localStream.getAudioTracks().forEach((track) => {
          connection.addTrack(track, localStream);
        });
      }

      // Add screen-share track if sharing is already active.
      const screenStream = screenStreamRef.current;

      if (screenStream) {
        screenStream.getVideoTracks().forEach((track) => {
          connection.addTrack(track, screenStream);
        });
      }

      connection.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(remote.socketId, {
            type: "candidate",
            candidate: event.candidate,
          });
        }
      };

      connection.ontrack = (event) => {
        let stream = event.streams?.[0];

        if (!stream) {
          stream = remoteStreamsRef.current.get(remote.socketId);

          if (!stream) {
            stream = new MediaStream();
            remoteStreamsRef.current.set(remote.socketId, stream);
          }

          if (
            !stream.getTracks().some(
              (track) => track.id === event.track.id
            )
          ) {
            stream.addTrack(event.track);
          }
        } else {
          remoteStreamsRef.current.set(remote.socketId, stream);
        }

        if (event.track.kind === "video") {
          setRemotePresenterSocketId(remote.socketId);

          event.track.onended = () => {
            setRemotePresenterSocketId((current) =>
              current === remote.socketId ? null : current
            );
          };
        }

        const updatedStream = remoteStreamsRef.current.get(
          remote.socketId
        );

        setRemoteStreams((previous) => {
          const existingIndex = previous.findIndex(
            (item) => item.socketId === remote.socketId
          );

          const entry = {
            socketId: remote.socketId,
            employeeId: remote.employeeId,
            name: remote.name || "Participant",
            stream: updatedStream,
          };

          if (existingIndex === -1) {
            return [...previous, entry];
          }

          const next = [...previous];
          next[existingIndex] = entry;
          return next;
        });
      };

      connection.onconnectionstatechange = () => {
        if (
          ["failed", "closed"].includes(connection.connectionState)
        ) {
          closePeer(remote.socketId);
        }
      };

      // Perfect-negotiation offer handling.
      connection.onnegotiationneeded = async () => {
        try {
          if (connection.signalingState !== "stable") {
            return;
          }

          peer.makingOffer = true;

          await connection.setLocalDescription();

          sendSignal(remote.socketId, {
            type: connection.localDescription.type,
            sdp: connection.localDescription.sdp,
          });
        } catch (error) {
          console.error("Meeting negotiation failed:", error);
        } finally {
          peer.makingOffer = false;
        }
      };

      setParticipants((previous) => {
        if (
          previous.some(
            (participant) =>
              participant.socketId === remote.socketId
          )
        ) {
          return previous;
        }

        return [
          ...previous,
          {
            socketId: remote.socketId,
            employeeId: remote.employeeId,
            name: remote.name || "Participant",
          },
        ];
      });

      return peer;
    },
    [sendSignal, closePeer]
  );

  // ==========================================
  // HANDLE INCOMING WEBRTC SIGNALS
  // ==========================================

  const handleIncomingSignal = useCallback(
    async (data = {}) => {
      const {
        fromSocketId,
        fromEmployeeId,
        fromName,
        signal,
      } = data;

      if (!fromSocketId || !signal || fromSocketId === socket.id) {
        return;
      }

      if (leavingRef.current) return;

      const peer = createPeer({
        socketId: fromSocketId,
        employeeId: fromEmployeeId,
        name: fromName,
      });

      if (!peer) return;

      const connection = peer.connection;

      try {
        if (signal.type === "offer" || signal.type === "answer") {
          const description = new RTCSessionDescription({
            type: signal.type,
            sdp: signal.sdp,
          });

          const offerCollision =
            signal.type === "offer" &&
            (peer.makingOffer ||
              connection.signalingState !== "stable");

          peer.ignoreOffer = !peer.polite && offerCollision;

          if (peer.ignoreOffer) return;

          if (offerCollision) {
            await connection.setLocalDescription({
              type: "rollback",
            });
          }

          await connection.setRemoteDescription(description);

          while (peer.pendingCandidates.length > 0) {
            const candidate = peer.pendingCandidates.shift();

            await connection.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }

          if (signal.type === "offer") {
            await connection.setLocalDescription();

            sendSignal(fromSocketId, {
              type: "answer",
              sdp: connection.localDescription.sdp,
            });
          }
        } else if (signal.type === "candidate") {
          if (peer.ignoreOffer || !signal.candidate) {
            return;
          }

          if (connection.remoteDescription) {
            await connection.addIceCandidate(
              new RTCIceCandidate(signal.candidate)
            );
          } else {
            peer.pendingCandidates.push(signal.candidate);
          }
        } else if (signal.type === "screen-share-start") {
          setRemotePresenterSocketId(fromSocketId);

          setRoomMessage(
            `${fromName || "A participant"} started screen sharing.`
          );
        } else if (signal.type === "screen-share-stop") {
          setRemotePresenterSocketId((current) =>
            current === fromSocketId ? null : current
          );

          setRoomMessage(
            `${fromName || "A participant"} stopped screen sharing.`
          );
        }
      } catch (error) {
        console.error("Meeting signal processing failed:", error);
      }
    },
    [createPeer, sendSignal]
  );

  // ==========================================
  // JOIN SOCKET MEETING
  // ==========================================

  const joinSocketMeeting = useCallback(() => {
    if (!socket.connected) {
      setConnectionError(
        "Your server connection is unavailable. Please reconnect."
      );
      setConnecting(false);
      return;
    }

    socket.emit("joinMeeting", { meetingId }, (response = {}) => {
      if (!mountedRef.current || leavingRef.current) return;

      if (!response.success) {
        setConnectionError(
          response.message || "Unable to enter this meeting."
        );
        setConnecting(false);
        return;
      }

      const connectedParticipants =
        response.connectedParticipants || [];

      connectedParticipants.forEach((participant) => {
        if (
          !participant.socketId ||
          participant.socketId === socket.id
        ) {
          return;
        }

        createPeer(participant);
      });

      setConnecting(false);
      setRoomMessage("You are connected to the meeting.");
    });
  }, [meetingId, createPeer]);

  // ==========================================
  // CLEAN UP MEETING MEDIA
  // ==========================================

  const cleanupMeetingMedia = useCallback(() => {
    const screenStream = screenStreamRef.current;

    if (screenStream) {
      screenStream.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });

      screenStreamRef.current = null;
    }

    const localStream = localStreamRef.current;

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
      });

      localStreamRef.current = null;
    }

    peersRef.current.forEach((peer) => {
      peer.connection.ontrack = null;
      peer.connection.onicecandidate = null;
      peer.connection.onnegotiationneeded = null;
      peer.connection.onconnectionstatechange = null;

      peer.connection.close();
    });

    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    audioElementsRef.current.clear();

    if (mountedRef.current) {
      setRemoteStreams([]);
      setParticipants([]);
      setSharingScreen(false);
      setMuted(false);
      setRemotePresenterSocketId(null);
    }
  }, []);

  // ==========================================
  // COMPLETE MEETING EXIT
  // ==========================================

  const completeMeetingExit = useCallback(
    (destination = {}) => {
      cleanupMeetingMedia();

      if (onMeetingExitComplete) {
        onMeetingExitComplete({
          targetPage: destination.targetPage || "VirtualOffice",
          targetRoom: destination.targetRoom,
        });
      } else {
        onNavigate("Meetings");
      }
    },
    [
      cleanupMeetingMedia,
      onMeetingExitComplete,
      onNavigate,
    ]
  );

  // ==========================================
  // PROCESS MEETING EXIT
  // ==========================================

  const processMeetingExit = useCallback(
    async (destination = {}) => {
      if (leavingRef.current) return;

      if (!meetingId) {
        setRoomMessage("Meeting information is missing.");
        return;
      }

      leavingRef.current = true;
      setLeaving(true);

      setRoomMessage(
        isHost
          ? "Ending meeting for everyone..."
          : "Leaving meeting..."
      );

      try {
        if (isHost) {
          await apiRequest(`/api/meetings/${meetingId}/end`, {
            method: "POST",
          });
        } else {
          await apiRequest(`/api/meetings/${meetingId}/leave`, {
            method: "POST",
          });
        }

        completeMeetingExit(destination);
      } catch (error) {
        console.error("Meeting exit failed:", error);

        leavingRef.current = false;

        if (mountedRef.current) {
          setLeaving(false);
          setRoomMessage(error.message || "Unable to leave meeting.");
        }
      }
    },
    [
      meetingId,
      isHost,
      apiRequest,
      completeMeetingExit,
    ]
  );

  // ==========================================
  // HANDLE APP EXIT CONFIRMATION
  // ==========================================

  useEffect(() => {
    if (!meetingExitRequest?.id) return;

    const requestId = meetingExitRequest.id;

    if (processedExitRequestRef.current === requestId) {
      return;
    }

    processedExitRequestRef.current = requestId;
    exitRequestRef.current = meetingExitRequest;

    processMeetingExit({
      targetPage:
        meetingExitRequest.targetPage || "VirtualOffice",
      targetRoom: meetingExitRequest.targetRoom,
    });
  }, [meetingExitRequest, processMeetingExit]);

  // ==========================================
  // INITIALIZE MEETING
  // ==========================================

  useEffect(() => {
    // IMPORTANT:
    // Reset lifecycle flags whenever this effect initializes.
    // React StrictMode runs an extra setup/cleanup cycle
    // during development. Without this reset, leavingRef
    // can remain true and prevent the meeting from starting.

    mountedRef.current = true;
    leavingRef.current = false;
    setLeaving(false);

    if (!meetingId || !token) {
      setConnectionError("Meeting information is missing.");
      setConnecting(false);
      return;
    }

    let cancelled = false;

    async function initializeMeeting() {
      try {
        setConnecting(true);
        setConnectionError("");
        setRoomMessage("");

        try {
          const stream =
            await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });

          if (cancelled || leavingRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          localStreamRef.current = stream;
        } catch (error) {
          console.warn("Microphone unavailable:", error);

          if (!cancelled) {
            setConnectionError(
              "Microphone access is unavailable. You can still enter the meeting."
            );
          }
        }

        if (!cancelled && !leavingRef.current) {
          joinSocketMeeting();
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Meeting initialization failed:", error);
          setConnectionError(error.message);
          setConnecting(false);
        }
      }
    }

    initializeMeeting();

    return () => {
      cancelled = true;
      mountedRef.current = false;

      leavingRef.current = true;

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      screenStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      peersRef.current.forEach((peer) => {
        peer.connection.ontrack = null;
        peer.connection.onicecandidate = null;
        peer.connection.onnegotiationneeded = null;
        peer.connection.onconnectionstatechange = null;

        peer.connection.close();
      });

      peersRef.current.clear();
      remoteStreamsRef.current.clear();
      audioElementsRef.current.clear();

      localStreamRef.current = null;
      screenStreamRef.current = null;
    };
  }, [meetingId, token, joinSocketMeeting]);

  // ==========================================
  // MEETING SOCKET EVENTS
  // ==========================================

  useEffect(() => {
    if (!meetingId) return;

    const handleParticipantConnected = (participant = {}) => {
      if (
        participant.socketId === socket.id ||
        leavingRef.current
      ) {
        return;
      }

      createPeer(participant);
    };

    const handleParticipantDisconnected = (participant = {}) => {
      if (participant.socketId) {
        closePeer(participant.socketId);
      }
    };

    const handleMeetingEnded = (data = {}) => {
      if (data.meetingId && data.meetingId !== meetingId) {
        return;
      }

      if (leavingRef.current) return;

      leavingRef.current = true;
      setLeaving(true);

      setRoomMessage("The host has ended this meeting.");

      completeMeetingExit({
        targetPage: "VirtualOffice",
      });
    };

    socket.on("meetingSignal", handleIncomingSignal);

    socket.on(
      "meetingSocketParticipantConnected",
      handleParticipantConnected
    );

    socket.on(
      "meetingSocketParticipantDisconnected",
      handleParticipantDisconnected
    );

    socket.on("meetingEnded", handleMeetingEnded);

    return () => {
      socket.off("meetingSignal", handleIncomingSignal);

      socket.off(
        "meetingSocketParticipantConnected",
        handleParticipantConnected
      );

      socket.off(
        "meetingSocketParticipantDisconnected",
        handleParticipantDisconnected
      );

      socket.off("meetingEnded", handleMeetingEnded);
    };
  }, [
    meetingId,
    handleIncomingSignal,
    createPeer,
    closePeer,
    completeMeetingExit,
  ]);

  // ==========================================
  // ATTACH REMOTE AUDIO STREAMS
  // ==========================================

  useEffect(() => {
    remoteStreams.forEach((item) => {
      const audio = audioElementsRef.current.get(item.socketId);

      if (audio && audio.srcObject !== item.stream) {
        audio.srcObject = item.stream;

        audio.play().catch((error) => {
          console.warn("Remote audio playback was blocked:", error);
        });
      }
    });
  }, [remoteStreams]);

  // ==========================================
  // ATTACH SCREEN PRESENTATION
  // ==========================================

  useEffect(() => {
    if (!screenVideoRef.current) return;

    let activeScreenStream = null;

    if (sharingScreen) {
      activeScreenStream = screenStreamRef.current;
    } else if (remotePresenterSocketId) {
      activeScreenStream =
        remoteStreams.find(
          (item) => item.socketId === remotePresenterSocketId
        )?.stream || null;
    }

    if (screenVideoRef.current.srcObject !== activeScreenStream) {
      screenVideoRef.current.srcObject = activeScreenStream;

      if (activeScreenStream) {
        screenVideoRef.current.play().catch((error) => {
          console.warn("Presentation playback failed:", error);
        });
      }
    }
  }, [remoteStreams, remotePresenterSocketId, sharingScreen]);

  // ==========================================
  // MUTE / UNMUTE
  // ==========================================

  const toggleMute = () => {
    const audioTracks =
      localStreamRef.current?.getAudioTracks() || [];

    if (audioTracks.length === 0) {
      setRoomMessage("No microphone is available.");
      return;
    }

    const nextMuted = !muted;

    audioTracks.forEach((track) => {
      track.enabled = !nextMuted;
    });

    setMuted(nextMuted);
  };

  // ==========================================
  // GET EXISTING VIDEO SENDER
  // ==========================================

  const getVideoSender = (connection) => {
    const videoTransceiver = connection
      .getTransceivers()
      .find(
        (transceiver) =>
          transceiver.receiver?.track?.kind === "video"
      );

    return videoTransceiver?.sender || null;
  };

  // ==========================================
  // STOP SCREEN SHARING
  // ==========================================

  const stopScreenShare = useCallback(() => {
    const screenStream = screenStreamRef.current;

    if (!screenStream) return;

    const screenTrack = screenStream.getVideoTracks()[0];

    if (screenTrack) {
      screenTrack.onended = null;
      screenTrack.stop();
    }

    screenStream.getTracks().forEach((track) => {
      if (track !== screenTrack) track.stop();
    });

    peersRef.current.forEach(({ connection }, socketId) => {
      const videoSender = getVideoSender(connection);

      if (videoSender) {
        videoSender.replaceTrack(null).catch((error) => {
          console.error("Unable to stop shared video track:", error);
        });
      }

      sendSignal(socketId, {
        type: "screen-share-stop",
      });
    });

    screenStreamRef.current = null;
    setSharingScreen(false);
    setRoomMessage("You stopped sharing your screen.");
  }, [sendSignal]);

  // ==========================================
  // START SCREEN SHARING
  // ==========================================

  const startScreenShare = async () => {
    if (leavingRef.current) return;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setRoomMessage(
        "Screen sharing is not supported by this browser."
      );
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });

      if (leavingRef.current || !mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      screenStreamRef.current = stream;

      const screenTrack = stream.getVideoTracks()[0];

      if (!screenTrack) {
        stopScreenShare();
        return;
      }

      const replaceOperations = [];

      peersRef.current.forEach(({ connection }) => {
        const videoSender = getVideoSender(connection);

        if (videoSender) {
          replaceOperations.push(
            videoSender.replaceTrack(screenTrack)
          );
        } else {
          connection.addTrack(screenTrack, stream);
        }
      });

      await Promise.all(replaceOperations);

      if (leavingRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        screenStreamRef.current = null;
        return;
      }

      screenTrack.onended = () => {
        stopScreenShare();
      };

      setSharingScreen(true);
      setRoomMessage("You are sharing your screen.");

      peersRef.current.forEach((peer, socketId) => {
        sendSignal(socketId, {
          type: "screen-share-start",
        });
      });
    } catch (error) {
      if (error.name !== "NotAllowedError") {
        console.error("Screen sharing failed:", error);
        setRoomMessage("Unable to start screen sharing.");
      }
    }
  };

  // ==========================================
  // MANUAL LEAVE
  // ==========================================

  const handleLeave = async () => {
    if (leavingRef.current) return;

    await processMeetingExit({
      targetPage: "VirtualOffice",
    });
  };

  // ==========================================
  // HOST ENDS MEETING
  // ==========================================

  const handleEndMeeting = async () => {
    if (leavingRef.current) return;

    const confirmed = window.confirm(
      "End this meeting for everyone?"
    );

    if (!confirmed) return;

    await processMeetingExit({
      targetPage: "VirtualOffice",
    });
  };

  // ==========================================
  // PARTICIPANT LIST
  // ==========================================

  const allParticipants = [
    {
      socketId: socket.id,
      employeeId: currentEmployeeId,
      name: user?.name || user?.fullName || "You",
      isLocal: true,
    },
    ...participants,
  ];

  const hasActivePresentation =
    sharingScreen || Boolean(remotePresenterSocketId);

  // ==========================================
  // MEETING ROOM UI
  // ==========================================

  return (
    <main className="app meeting-room-page">
      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="Meetings"
      />

      <section className="meeting-room-container">
        <header className="meeting-room-heading">
          <div>
            <p className="meeting-room-eyebrow">
              PROXISPEAK · LIVE SESSION
            </p>

            <h1>{meeting?.title || "Team Meeting"}</h1>

            <p>
              {meeting?.teamName || "Team Workspace"} · Hosted by{" "}
              {meeting?.hostName || "Meeting Host"}
            </p>
          </div>

          <span className="meeting-live-indicator">
            <span />
            LIVE
          </span>
        </header>

        {connectionError && (
          <div className="meeting-room-notice error">
            {connectionError}
          </div>
        )}

        {roomMessage && (
          <div className="meeting-room-notice">
            {roomMessage}
          </div>
        )}

        {connecting ? (
          <div className="meeting-room-loading">
            <div className="meeting-room-spinner" />
            <h2>Connecting to meeting...</h2>
            <p>Preparing your microphone and participants.</p>
          </div>
        ) : (
          <>
            <div className="meeting-room-content">
              <section className="meeting-stage">
                <div className="meeting-stage-header">
                  <h2>Meeting Stage</h2>

                  <span>
                    {allParticipants.length} participant
                    {allParticipants.length === 1 ? "" : "s"}
                  </span>
                </div>

                {hasActivePresentation && (
                  <div className="meeting-screen-area">
                    <video
                      ref={screenVideoRef}
                      className="meeting-shared-screen"
                      autoPlay
                      playsInline
                      muted
                    />
                  </div>
                )}

                <div className="meeting-participant-grid">
                  {allParticipants.map((participant) => (
                    <div
                      className="meeting-room-participant"
                      key={
                        participant.socketId ||
                        participant.employeeId
                      }
                    >
                      <div className="meeting-room-avatar">
                        {(participant.name || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <strong>
                        {participant.name}
                        {participant.isLocal ? " (You)" : ""}
                      </strong>

                      {participant.isLocal && muted && (
                        <span className="meeting-muted-label">
                          Muted
                        </span>
                      )}

                      {participant.employeeId ===
                        meeting?.hostEmployeeId && (
                        <span className="meeting-room-host-label">
                          HOST
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <aside className="meeting-room-sidebar">
                <div className="meeting-sidebar-heading">
                  <h2>Participants</h2>
                  <span>{allParticipants.length}</span>
                </div>

                {allParticipants.map((participant) => (
                  <div
                    className="meeting-sidebar-person"
                    key={
                      participant.socketId ||
                      participant.employeeId
                    }
                  >
                    <div className="meeting-sidebar-avatar">
                      {(participant.name || "?")
                        .charAt(0)
                        .toUpperCase()}
                    </div>

                    <div>
                      <strong>
                        {participant.name}
                        {participant.isLocal ? " (You)" : ""}
                      </strong>

                      <span>
                        {participant.employeeId || "Participant"}
                      </span>
                    </div>
                  </div>
                ))}
              </aside>
            </div>

            {/* Hidden remote audio players */}
            <div className="meeting-hidden-audio">
              {remoteStreams.map((item) => (
                <audio
                  key={item.socketId}
                  ref={(element) => {
                    if (element) {
                      audioElementsRef.current.set(
                        item.socketId,
                        element
                      );
                    } else {
                      audioElementsRef.current.delete(
                        item.socketId
                      );
                    }
                  }}
                  autoPlay
                  playsInline
                />
              ))}
            </div>

            <div className="meeting-control-bar">
              <button
                className={`meeting-control-button ${
                  muted ? "active" : ""
                }`}
                onClick={toggleMute}
                disabled={connecting || leaving}
              >
                <span>{muted ? "🔇" : "🎙️"}</span>
                {muted ? "Unmute" : "Mute"}
              </button>

              <button
                className={`meeting-control-button ${
                  sharingScreen ? "active" : ""
                }`}
                onClick={
                  sharingScreen
                    ? stopScreenShare
                    : startScreenShare
                }
                disabled={connecting || leaving}
              >
                <span>▣</span>
                {sharingScreen ? "Stop Sharing" : "Share Screen"}
              </button>

              {isHost ? (
                <button
                  className="meeting-end-control"
                  onClick={handleEndMeeting}
                  disabled={leaving}
                >
                  {leaving ? "Ending..." : "End Meeting"}
                </button>
              ) : (
                <button
                  className="meeting-leave-control"
                  onClick={handleLeave}
                  disabled={leaving}
                >
                  {leaving ? "Leaving..." : "Leave Meeting"}
                </button>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

export default MeetingRoom;
