import { useState, useEffect, useRef } from "react";
import Header from "../components/Header";
import socket from "../socket";
import "./Chat.css";

function Chat({
  user,
  onNavigate,
  onLogout,
  onlineEmployees = [],
  connected = false,
  messages = [],
}) {
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // ==========================================
  // RECEIVE CHAT ERRORS
  // Messages themselves are managed globally
  // by App.jsx.
  // ==========================================

  useEffect(() => {
    function handleChatError(error) {
      alert(error?.message || "Unable to send message.");
      setSending(false);
    }

    socket.on("chatError", handleChatError);

    return () => {
      socket.off("chatError", handleChatError);
    };
  }, []);

  // ==========================================
  // AUTO SCROLL TO LATEST MESSAGE
  // ==========================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // ==========================================
  // SEND MESSAGE
  // ==========================================

  function handleSendMessage(event) {
    event.preventDefault();

    const message = messageInput.trim();

    if (!message || sending) return;

    if (!connected || !socket.connected) {
      alert("You are disconnected from the office. Please reconnect.");
      return;
    }

    if (message.length > 1000) {
      alert("Messages cannot exceed 1000 characters.");
      return;
    }

    setSending(true);

    // Send message to the backend.
    // App.jsx receives the broadcast globally.
    socket.emit("sendMessage", { message });

    setMessageInput("");

    inputRef.current?.focus();

    setSending(false);
  }

  // ==========================================
  // MESSAGE TIME FORMAT
  // ==========================================

  function formatMessageTime(timestamp) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ==========================================
  // AVATAR INITIALS
  // ==========================================

  function getInitials(name) {
    if (!name) return "U";

    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  // ==========================================
  // DATE SEPARATOR
  // ==========================================

  function getMessageDate(timestamp) {
    const date = new Date(timestamp);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const today = new Date();
    const yesterday = new Date();

    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    }

    if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday";
    }

    return date.toLocaleDateString([], {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  // ==========================================
  // RENDER CHAT
  // ==========================================

  return (
    <div className="chat-page">
      <Header
        user={user}
        onNavigate={onNavigate}
        onLogout={onLogout}
        currentPage="Chat"
      />

      <main className="chat-container">

        {/* CHAT HEADER */}

        <section className="chat-main">

          <div className="chat-topbar">

            <div className="chat-title-section">
              <div className="chat-title-icon">
                <span>💬</span>
              </div>

              <div>
                <h2>Office Chat</h2>
                <p>Connect and communicate with your team</p>
              </div>
            </div>

            <div className="chat-live-status">
              <span
                className={`chat-status-dot ${
                  connected ? "online" : "offline"
                }`}
              ></span>

              {connected ? "Connected" : "Disconnected"}
            </div>

          </div>

          {/* MESSAGE AREA */}

          <div className="chat-messages">

            {messages.length === 0 ? (

              <div className="chat-empty-state">

                <div className="chat-empty-icon">
                  💬
                </div>

                <h3>Welcome to Office Chat!</h3>

                <p>
                  Start a conversation with your colleagues.
                  Messages will appear here in real time.
                </p>

                <span className="chat-empty-hint">
                  Your messages stay available throughout your login session.
                </span>

              </div>

            ) : (

              <div className="chat-message-list">

                {messages.map((message, index) => {
                  const isOwnMessage =
                    message.senderId === user?.employeeId;

                  const previousMessage = messages[index - 1];

                  const showDate =
                    !previousMessage ||
                    getMessageDate(previousMessage.timestamp) !==
                      getMessageDate(message.timestamp);

                  return (
                    <div key={message.id}>

                      {showDate && (
                        <div className="chat-date-divider">
                          <span>
                            {getMessageDate(message.timestamp)}
                          </span>
                        </div>
                      )}

                      <div
                        className={`chat-message-row ${
                          isOwnMessage ? "own-message" : "other-message"
                        }`}
                      >

                        {!isOwnMessage && (
                          <div className="chat-avatar">
                            {getInitials(message.senderName)}
                          </div>
                        )}

                        <div className="chat-message-content">

                          {!isOwnMessage && (
                            <div className="chat-sender-info">
                              <span className="chat-sender-name">
                                {message.senderName}
                              </span>

                              <span className="chat-sender-id">
                                {message.senderId}
                              </span>
                            </div>
                          )}

                          <div className="chat-message-bubble">
                            <p>{message.message}</p>
                          </div>

                          <span className="chat-message-time">
                            {formatMessageTime(message.timestamp)}
                          </span>

                        </div>

                        {isOwnMessage && (
                          <div className="chat-avatar own-avatar">
                            {getInitials(user?.name)}
                          </div>
                        )}

                      </div>

                    </div>
                  );
                })}

                <div ref={messagesEndRef} />

              </div>

            )}

          </div>

          {/* MESSAGE INPUT */}

          <form
            className="chat-input-area"
            onSubmit={handleSendMessage}
          >

            <div className="chat-input-wrapper">

              <input
                ref={inputRef}
                type="text"
                value={messageInput}
                onChange={(event) =>
                  setMessageInput(event.target.value.slice(0, 1000))
                }
                placeholder={
                  connected
                    ? "Type your message..."
                    : "Waiting for office connection..."
                }
                disabled={!connected}
                maxLength={1000}
              />

              <span className="chat-character-count">
                {messageInput.length}/1000
              </span>

            </div>

            <button
              type="submit"
              className="chat-send-button"
              disabled={
                !connected ||
                !messageInput.trim() ||
                sending
              }
            >
              <span>Send</span>
              <span className="chat-send-icon">➤</span>
            </button>

          </form>

          <div className="chat-input-footer">
            <span>
              Messages are visible to everyone currently connected.
            </span>

            <span>
              <span className="chat-security-icon">🔒</span>
              Office-wide chat
            </span>
          </div>

        </section>

        {/* ONLINE EMPLOYEES SIDEBAR */}

        <aside className="chat-sidebar">

          <div className="chat-sidebar-header">
            <div>
              <h3>Office Members</h3>
              <p>People currently online</p>
            </div>

            <span className="chat-member-count">
              {onlineEmployees.length}
            </span>
          </div>

          <div className="chat-online-list">

            {onlineEmployees.length === 0 ? (

              <div className="chat-no-members">
                No employees online.
              </div>

            ) : (

              onlineEmployees.map((employee) => {
                const isCurrentUser =
                  employee.userId === user?.employeeId;

                return (
                  <div
                    className="chat-member"
                    key={employee.socketId || employee.userId}
                  >

                    <div className="chat-member-avatar">
                      {getInitials(employee.name)}
                      <span className="chat-member-online-dot"></span>
                    </div>

                    <div className="chat-member-details">

                      <h4>
                        {employee.name}

                        {isCurrentUser && (
                          <span className="chat-you-label">
                            You
                          </span>
                        )}
                      </h4>

                      <p>{employee.userId}</p>

                    </div>

                  </div>
                );
              })

            )}

          </div>

          <div className="chat-sidebar-footer">
            <div className="chat-sidebar-footer-icon">
              <span>🌐</span>
            </div>

            <div>
              <h4>Office-wide conversation</h4>
              <p>
                Everyone online can participate in this chat.
              </p>
            </div>
          </div>

        </aside>

      </main>
    </div>
  );
}

export default Chat;