const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { performance } = require("node:perf_hooks");

const UserLocation = require("./models/UserLocation");
const Employee = require("./models/Employee");
const authRoutes = require("./routes/authRoutes");

dotenv.config();
mongoose.set("autoIndex", false);

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.use("/api/auth", authRoutes);

// ==========================================
// SOCKET.IO CONFIGURATION
// ==========================================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ==========================================
// VIRTUAL OFFICE SETTINGS
// ==========================================

const PORT = process.env.PORT || 5000;

const OFFICE_WIDTH = 800;
const OFFICE_HEIGHT = 500;

const DEFAULT_VOICE_RANGE = 120;
const ALLOWED_VOICE_RANGES = [75, 120];

const TARGET_QUERY_TIME_MS = 20;
const CLUSTER_DISTANCE_PIXELS = 100;

const COLLISION_DISTANCE = 20;
const MAX_CHAT_MESSAGE_LENGTH = 1000;

// ==========================================
// ROOM CONFIGURATION
// ==========================================

const ROOMS = {
  workspace: {
    id: "workspace",
    name: "Workspace",
    voiceMode: "proximity",
  },

  conference: {
    id: "conference",
    name: "Conference Room",
    voiceMode: "group",
  },

  meeting1: {
    id: "meeting1",
    name: "Meeting Room 01",
    voiceMode: "group",
  },

  meeting2: {
    id: "meeting2",
    name: "Meeting Room 02",
    voiceMode: "group",
  },
};

const DEFAULT_ROOM = "workspace";

function isValidRoom(roomId) {
  return (
    typeof roomId === "string" &&
    Object.prototype.hasOwnProperty.call(ROOMS, roomId)
  );
}

function getRoomInfo(roomId) {
  return ROOMS[roomId] || ROOMS[DEFAULT_ROOM];
}

// ==========================================
// CONNECTED EMPLOYEES
// ==========================================

// Key: Socket ID
const employees = new Map();

// Employee positions are stored separately for each room.
const employeePositions = new Map();

// ==========================================
// POSITION STORAGE HELPERS
// ==========================================

function getEmployeeRoomPositions(userId) {
  if (!employeePositions.has(userId)) {
    employeePositions.set(userId, {});
  }

  return employeePositions.get(userId);
}

function getSavedPosition(userId, roomId) {
  const positions = getEmployeeRoomPositions(userId);

  return positions[roomId] || null;
}

function saveEmployeePosition(employee) {
  const positions = getEmployeeRoomPositions(employee.userId);

  positions[employee.currentRoom] = {
    x: employee.x,
    y: employee.y,
  };

  employeePositions.set(employee.userId, positions);
}

// ==========================================
// SOCKET JWT AUTHENTICATION
// ==========================================

io.use(async (socket, next) => {
  try {
    const auth = socket.handshake.auth || {};
    const token = auth.token;

    if (typeof token !== "string" || !token.trim()) {
      return next(
        new Error("Authentication required. Please log in.")
      );
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return next(new Error("Invalid authentication token."));
    }

    const employee = await Employee.findById(decoded.id).select(
      "employeeId name role department isActive"
    );

    if (!employee || !employee.isActive) {
      return next(
        new Error("Employee account not found or inactive.")
      );
    }

    socket.data.employee = {
      id: employee._id.toString(),
      userId: employee.employeeId,
      name: employee.name,
      role: employee.role,
      department: employee.department,
    };

    next();
  } catch (error) {
    console.error("Socket authentication failed:", error.message);

    next(
      new Error(
        "Invalid or expired login session. Please log in again."
      )
    );
  }
});

// ==========================================
// DISTANCE HELPERS
// ==========================================

function distanceInPixels(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function distanceBetweenEmployees(employee1, employee2) {
  return distanceInPixels(
    employee1.x,
    employee1.y,
    employee2.x,
    employee2.y
  );
}

// ==========================================
// VOICE RANGE PERMISSION
// ==========================================

// Main Workspace only.
//
// Both employees must be within the smaller of their
// selected ranges before a WebRTC connection is allowed.
//
// 75px + 75px  = 75px
// 75px + 120px = 75px
// 120px + 120px = 120px

function canEmployeesConnectByProximity(employee1, employee2) {
  if (
    !employee1 ||
    !employee2 ||
    employee1.currentRoom !== employee2.currentRoom
  ) {
    return false;
  }

  const roomInfo = getRoomInfo(employee1.currentRoom);

  // Group rooms do not use proximity restrictions.
  if (roomInfo.voiceMode === "group") {
    return true;
  }

  const mutualRange = Math.min(
    employee1.voiceRange,
    employee2.voiceRange
  );

  const distance = distanceBetweenEmployees(
    employee1,
    employee2
  );

  return distance <= mutualRange;
}

// ==========================================
// COLLISION DETECTION
// ROOM-SPECIFIC
// ==========================================

function isPositionAvailable(
  x,
  y,
  roomId,
  excludeSocketId = null
) {
  for (const employee of employees.values()) {
    if (employee.socketId === excludeSocketId) {
      continue;
    }

    if (employee.currentRoom !== roomId) {
      continue;
    }

    const distance = distanceInPixels(
      x,
      y,
      employee.x,
      employee.y
    );

    if (distance < COLLISION_DISTANCE) {
      return false;
    }
  }

  return true;
}

// ==========================================
// FIND A FREE SPAWN POSITION
// ROOM-SPECIFIC
// ==========================================

function findFreePosition(
  preferredX,
  preferredY,
  roomId
) {
  const x = Math.max(
    30,
    Math.min(OFFICE_WIDTH - 30, preferredX)
  );

  const y = Math.max(
    30,
    Math.min(OFFICE_HEIGHT - 30, preferredY)
  );

  if (isPositionAvailable(x, y, roomId)) {
    return { x, y };
  }

  const step = COLLISION_DISTANCE + 5;

  for (let radius = step; radius <= 500; radius += step) {
    for (let angle = 0; angle < 360; angle += 22.5) {
      const radians = (angle * Math.PI) / 180;

      const candidateX = Math.max(
        30,
        Math.min(
          OFFICE_WIDTH - 30,
          x + Math.cos(radians) * radius
        )
      );

      const candidateY = Math.max(
        30,
        Math.min(
          OFFICE_HEIGHT - 30,
          y + Math.sin(radians) * radius
        )
      );

      if (
        isPositionAvailable(
          candidateX,
          candidateY,
          roomId
        )
      ) {
        return {
          x: candidateX,
          y: candidateY,
        };
      }
    }
  }

  // Final fallback: scan the room in a grid.
  for (
    let gridY = 30;
    gridY <= OFFICE_HEIGHT - 30;
    gridY += step
  ) {
    for (
      let gridX = 30;
      gridX <= OFFICE_WIDTH - 30;
      gridX += step
    ) {
      if (isPositionAvailable(gridX, gridY, roomId)) {
        return {
          x: gridX,
          y: gridY,
        };
      }
    }
  }

  return null;
}

// ==========================================
// RESOLVE EMPLOYEE MOVEMENT
// ROOM-SPECIFIC
// ==========================================

function resolveMovement(employee, targetX, targetY) {
  const currentX = employee.x;
  const currentY = employee.y;

  const roomId = employee.currentRoom;

  const nextX = Math.max(
    30,
    Math.min(OFFICE_WIDTH - 30, targetX)
  );

  const nextY = Math.max(
    30,
    Math.min(OFFICE_HEIGHT - 30, targetY)
  );

  if (
    isPositionAvailable(
      nextX,
      nextY,
      roomId,
      employee.socketId
    )
  ) {
    return {
      x: nextX,
      y: nextY,
    };
  }

  const horizontalAvailable = isPositionAvailable(
    nextX,
    currentY,
    roomId,
    employee.socketId
  );

  const verticalAvailable = isPositionAvailable(
    currentX,
    nextY,
    roomId,
    employee.socketId
  );

  if (horizontalAvailable && verticalAvailable) {
    if (
      Math.abs(nextX - currentX) >=
      Math.abs(nextY - currentY)
    ) {
      return {
        x: nextX,
        y: currentY,
      };
    }

    return {
      x: currentX,
      y: nextY,
    };
  }

  if (horizontalAvailable) {
    return {
      x: nextX,
      y: currentY,
    };
  }

  if (verticalAvailable) {
    return {
      x: currentX,
      y: nextY,
    };
  }

  return {
    x: currentX,
    y: currentY,
  };
}

// ==========================================
// EMPLOYEE STATE BROADCAST
// ==========================================

function broadcastEmployeeState() {
  const employeeList = Array.from(employees.values());

  // Update the global employee directory.
  io.emit("employeesUpdate", employeeList);

  // Send room-aware voice information to each employee.
  for (const socket of io.sockets.sockets.values()) {
    const currentEmployee = employees.get(socket.id);

    if (!currentEmployee) continue;

    const roomInfo = getRoomInfo(
      currentEmployee.currentRoom
    );

    const sameRoomEmployees = employeeList
      .filter((employee) => {
        return (
          employee.socketId !== socket.id &&
          employee.currentRoom === currentEmployee.currentRoom
        );
      })
      .map((employee) => ({
        ...employee,

        distance: Number(
          distanceBetweenEmployees(
            currentEmployee,
            employee
          ).toFixed(2)
        ),
      }));

    let nearbyEmployees;
    let voicePeers;

    if (roomInfo.voiceMode === "proximity") {
      // ======================================
      // MAIN WORKSPACE — MUTUAL RANGE
      // ======================================

      // A pair is included only when BOTH employees
      // are within the smaller of their two ranges.

      const mutuallyNearbyEmployees = sameRoomEmployees.filter(
        (employee) => {
          const mutualRange = Math.min(
            currentEmployee.voiceRange,
            employee.voiceRange
          );

          return employee.distance <= mutualRange;
        }
      );

      nearbyEmployees = mutuallyNearbyEmployees.map(
        (employee) => ({
          ...employee,

          youHearThem: true,
          theyHearYou: true,
        })
      );

      // WebRTC connections are created only for
      // mutually permitted voice pairs.
      voicePeers = nearbyEmployees;
    } else {
      // ======================================
      // GROUP ROOMS — UNRESTRICTED VOICE
      // ======================================

      nearbyEmployees = sameRoomEmployees.map(
        (employee) => ({
          ...employee,

          youHearThem: true,
          theyHearYou: true,
        })
      );

      voicePeers = nearbyEmployees;
    }

    socket.emit("proximityUpdate", {
      nearbyEmployees,
      voicePeers,

      voiceRange:
        roomInfo.voiceMode === "proximity"
          ? currentEmployee.voiceRange
          : null,

      voiceRangePreference: currentEmployee.voiceRange,

      currentRoom: currentEmployee.currentRoom,

      voiceMode: roomInfo.voiceMode,
    });
  }
}

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  res.json({
    success: true,

    message: "ProxiSpeak backend is running.",

    coordinateSystem: "Virtual office pixels (x, y)",

    office: {
      width: OFFICE_WIDTH,
      height: OFFICE_HEIGHT,
    },

    rooms: Object.values(ROOMS),

    defaultRoom: DEFAULT_ROOM,

    defaultVoiceRangePixels: DEFAULT_VOICE_RANGE,

    availableWorkspaceVoiceRanges: ALLOWED_VOICE_RANGES,

    collisionDistancePixels: COLLISION_DISTANCE,

    connectedEmployees: employees.size,

    cachedEmployeePositions: employeePositions.size,

    chatEnabled: true,

    chatStorage: "Temporary frontend state only",
  });
});

// ==========================================
// DEMO DATA FOR DATABASE TESTING ONLY
// ==========================================

app.post("/api/spatial-audit/demo-data", async (req, res) => {
  try {
    const demoEmployees = [
      {
        userId: "rajdip",
        name: "Rajdip Jana",
        location: [400, 250],
      },
      {
        userId: "dona",
        name: "Dona Mondal",
        location: [450, 270],
      },
      {
        userId: "rithvik",
        name: "Rithvik",
        location: [650, 250],
      },
      {
        userId: "abdul",
        name: "Abdul",
        location: [690, 270],
      },
    ];

    await UserLocation.deleteMany({
      userId: {
        $in: demoEmployees.map(
          (employee) => employee.userId
        ),
      },
    });

    await UserLocation.insertMany(demoEmployees);

    res.json({
      success: true,

      message:
        "Virtual-office demo data inserted successfully.",

      note:
        "These are fixed database test records, not live positions.",

      coordinateSystem: "Virtual office pixels (x, y)",

      employees: demoEmployees.map((employee) => ({
        userId: employee.userId,
        name: employee.name,
        x: employee.location[0],
        y: employee.location[1],
      })),
    });
  } catch (error) {
    console.error("Demo data error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to insert demo data.",
      error: error.message,
    });
  }
});

// ==========================================
// SPATIAL AUDIT — LIVE ROOM POSITIONS
// ==========================================

app.get("/api/spatial-audit", (req, res) => {
  const requestStart = performance.now();

  try {
    const x = Number(req.query.x ?? 400);
    const y = Number(req.query.y ?? 250);
    const radius = Number(req.query.radius ?? 500);

    const roomId = req.query.room || DEFAULT_ROOM;

    if (!isValidRoom(roomId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid room ID.",
        availableRooms: Object.keys(ROOMS),
      });
    }

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(radius) ||
      x < 0 ||
      x > OFFICE_WIDTH ||
      y < 0 ||
      y > OFFICE_HEIGHT ||
      radius <= 0
    ) {
      return res.status(400).json({
        success: false,

        message:
          "Provide valid x and y coordinates inside the virtual office and a positive radius.",

        office: {
          width: OFFICE_WIDTH,
          height: OFFICE_HEIGHT,
        },
      });
    }

    const queryStart = performance.now();

    const liveEmployees = Array.from(employees.values())
      .filter(
        (employee) => employee.currentRoom === roomId
      )
      .map((employee) => ({
        userId: employee.userId,
        name: employee.name,
        socketId: employee.socketId,
        currentRoom: employee.currentRoom,
        x: employee.x,
        y: employee.y,
      }));

    const queryTimeMs = Number(
      (performance.now() - queryStart).toFixed(3)
    );

    const nearbyEmployees = liveEmployees
      .map((employee) => {
        const exactDistance = distanceInPixels(
          x,
          y,
          employee.x,
          employee.y
        );

        return {
          ...employee,

          distancePixels: Number(
            exactDistance.toFixed(2)
          ),

          exactDistance,
        };
      })
      .filter(
        (employee) => employee.exactDistance <= radius
      )
      .sort(
        (a, b) => a.exactDistance - b.exactDistance
      )
      .map(({ exactDistance, ...employee }) => employee);

    const clusters = [];
    const assigned = new Set();

    for (
      let i = 0;
      i < nearbyEmployees.length;
      i++
    ) {
      if (assigned.has(i)) continue;

      const cluster = [];
      const queue = [i];

      assigned.add(i);

      while (queue.length > 0) {
        const currentIndex = queue.shift();

        const currentEmployee =
          nearbyEmployees[currentIndex];

        cluster.push(currentEmployee);

        for (
          let j = 0;
          j < nearbyEmployees.length;
          j++
        ) {
          if (assigned.has(j)) continue;

          const candidate = nearbyEmployees[j];

          const distance = distanceBetweenEmployees(
            currentEmployee,
            candidate
          );

          if (distance <= CLUSTER_DISTANCE_PIXELS) {
            assigned.add(j);
            queue.push(j);
          }
        }
      }

      clusters.push(cluster);
    }

    const totalProcessingMs = Number(
      (performance.now() - requestStart).toFixed(3)
    );

    return res.json({
      success: true,

      dataSource:
        "Live Socket.IO virtual-office positions",

      coordinateSystem:
        "Virtual office pixels (x, y)",

      room: getRoomInfo(roomId),

      searchCenter: { x, y },

      radiusPixels: radius,

      clusterDistancePixels:
        CLUSTER_DISTANCE_PIXELS,

      collisionDistancePixels:
        COLLISION_DISTANCE,

      totalConnectedEmployees: liveEmployees.length,

      nearbyCount: nearbyEmployees.length,

      nearbyEmployees,

      clusterCount: clusters.length,

      clusters: clusters.map((cluster, index) => ({
        clusterId: index + 1,
        employeeCount: cluster.length,
        employees: cluster,
      })),

      performance: {
        queryTimeMs,
        totalProcessingMs,
        targetMs: TARGET_QUERY_TIME_MS,

        queryWithinTarget:
          queryTimeMs < TARGET_QUERY_TIME_MS,

        totalWithinTarget:
          totalProcessingMs < TARGET_QUERY_TIME_MS,
      },
    });
  } catch (error) {
    console.error("Live spatial audit error:", error);

    return res.status(500).json({
      success: false,
      message: "Live spatial audit failed.",
      error: error.message,
    });
  }
});

// ==========================================
// SOCKET CONNECTIONS
// ==========================================

io.on("connection", (socket) => {
  const authenticatedEmployee = socket.data.employee;

  const userId = authenticatedEmployee.userId;
  const name = authenticatedEmployee.name;

  // Every new connection starts in Workspace.
  const initialRoom = DEFAULT_ROOM;

  // Restore this employee's Workspace position.
  const savedPosition = getSavedPosition(
    userId,
    initialRoom
  );

  const preferredX = savedPosition
    ? savedPosition.x
    : 400;

  const preferredY = savedPosition
    ? savedPosition.y
    : 250;

  const spawnPosition = findFreePosition(
    preferredX,
    preferredY,
    initialRoom
  );

  if (!spawnPosition) {
    console.log(
      `Workspace full. Connection rejected: ${name}`
    );

    socket.emit("officeFull", {
      message: "The Workspace is currently full.",
    });

    socket.disconnect(true);
    return;
  }

  const employee = {
    socketId: socket.id,

    userId,
    name,

    role: authenticatedEmployee.role,
    department: authenticatedEmployee.department,

    currentRoom: initialRoom,

    x: spawnPosition.x,
    y: spawnPosition.y,

    isVoiceActive: false,
    isMuted: false,

    voiceRange: DEFAULT_VOICE_RANGE,
  };

  employees.set(socket.id, employee);

  saveEmployeePosition(employee);

  console.log(
    `${name} (${userId}) connected in ${getRoomInfo(initialRoom).name} at X:${employee.x}, Y:${employee.y}`
  );

  broadcastEmployeeState();

  // ========================================
  // ROOM SWITCHING
  // ========================================

  socket.on("switchRoom", (payload = {}, callback) => {
    const currentEmployee = employees.get(socket.id);

    if (!currentEmployee) return;

    const requestedRoom =
      typeof payload.roomId === "string"
        ? payload.roomId
        : "";

    if (!isValidRoom(requestedRoom)) {
      const result = {
        success: false,
        message: "Invalid room selected.",
      };

      if (typeof callback === "function") {
        callback(result);
      } else {
        socket.emit("roomSwitchError", result);
      }

      return;
    }

    if (currentEmployee.currentRoom === requestedRoom) {
      const result = {
        success: true,
        unchanged: true,
        currentRoom: currentEmployee.currentRoom,
        employee: currentEmployee,
      };

      if (typeof callback === "function") {
        callback(result);
      }

      return;
    }

    const previousRoom = currentEmployee.currentRoom;

    saveEmployeePosition(currentEmployee);

    const savedDestinationPosition = getSavedPosition(
      currentEmployee.userId,
      requestedRoom
    );

    const preferredX = savedDestinationPosition
      ? savedDestinationPosition.x
      : 400;

    const preferredY = savedDestinationPosition
      ? savedDestinationPosition.y
      : 250;

    const destinationPosition = findFreePosition(
      preferredX,
      preferredY,
      requestedRoom
    );

    if (!destinationPosition) {
      const result = {
        success: false,
        message:
          `${getRoomInfo(requestedRoom).name} is currently full.`,
      };

      if (typeof callback === "function") {
        callback(result);
      } else {
        socket.emit("roomSwitchError", result);
      }

      return;
    }

    currentEmployee.currentRoom = requestedRoom;

    currentEmployee.x = destinationPosition.x;
    currentEmployee.y = destinationPosition.y;

    currentEmployee.isVoiceActive = false;
    currentEmployee.isMuted = false;

    employees.set(socket.id, currentEmployee);

    saveEmployeePosition(currentEmployee);

    console.log(
      `${currentEmployee.name} switched from ${getRoomInfo(previousRoom).name} to ${getRoomInfo(requestedRoom).name}`
    );

    broadcastEmployeeState();

    const result = {
      success: true,

      previousRoom,

      currentRoom: requestedRoom,

      room: getRoomInfo(requestedRoom),

      employee: currentEmployee,
    };

    socket.emit("roomChanged", result);

    if (typeof callback === "function") {
      callback(result);
    }
  });

  // ========================================
  // EMPLOYEE MOVEMENT WITH COLLISION CONTROL
  // ========================================

  socket.on("employeeMove", (movement) => {
    const currentEmployee = employees.get(socket.id);

    if (!currentEmployee || !movement) return;

    const targetX = Number(movement.x);
    const targetY = Number(movement.y);

    if (
      !Number.isFinite(targetX) ||
      !Number.isFinite(targetY)
    ) {
      return;
    }

    const resolvedPosition = resolveMovement(
      currentEmployee,
      targetX,
      targetY
    );

    currentEmployee.x = resolvedPosition.x;
    currentEmployee.y = resolvedPosition.y;

    employees.set(socket.id, currentEmployee);

    saveEmployeePosition(currentEmployee);

    // Recalculate mutual voice permissions after movement.
    broadcastEmployeeState();
  });

  // ========================================
  // REAL-TIME OFFICE CHAT
  // ========================================

  socket.on("sendMessage", (payload = {}) => {
    const currentEmployee = employees.get(socket.id);

    if (!currentEmployee) return;

    const messageText =
      typeof payload.message === "string"
        ? payload.message.trim()
        : "";

    if (!messageText) {
      socket.emit("chatError", {
        message: "Message cannot be empty.",
      });

      return;
    }

    if (
      messageText.length > MAX_CHAT_MESSAGE_LENGTH
    ) {
      socket.emit("chatError", {
        message:
          `Messages cannot exceed ${MAX_CHAT_MESSAGE_LENGTH} characters.`,
      });

      return;
    }

    const chatMessage = {
      id: `${Date.now()}-${socket.id}`,

      senderId: currentEmployee.userId,
      senderName: currentEmployee.name,

      message: messageText,

      timestamp: new Date().toISOString(),
    };

    io.emit("newMessage", chatMessage);

    console.log(
      `[Office Chat] ${currentEmployee.name} (${currentEmployee.userId}): ${messageText}`
    );
  });

  // ========================================
  // MAIN WORKSPACE VOICE RANGE PREFERENCE
  // ========================================

  socket.on("setVoiceRange", (payload = {}) => {
    const currentEmployee = employees.get(socket.id);

    if (!currentEmployee) return;

    const selectedRange = Number(payload.voiceRange);

    if (!ALLOWED_VOICE_RANGES.includes(selectedRange)) {
      socket.emit("voiceRangeError", {
        message:
          "Voice range must be either 75 or 120 pixels.",

        allowedRanges: ALLOWED_VOICE_RANGES,
      });

      return;
    }

    currentEmployee.voiceRange = selectedRange;

    employees.set(socket.id, currentEmployee);

    console.log(
      `${currentEmployee.name} selected ${selectedRange}px Main Workspace voice range.`
    );

    // Changing the range immediately recalculates
    // all mutual voice permissions.
    broadcastEmployeeState();
  });

  // ========================================
  // VOICE STATUS TRACKING
  // ========================================

  socket.on("voiceStatus", (status = {}) => {
    const currentEmployee = employees.get(socket.id);

    if (!currentEmployee) return;

    currentEmployee.isVoiceActive =
      status.isVoiceActive === true;

    currentEmployee.isMuted =
      currentEmployee.isVoiceActive &&
      status.isMuted === true;

    employees.set(socket.id, currentEmployee);

    console.log(
      `${currentEmployee.name} (${getRoomInfo(currentEmployee.currentRoom).name}) voice status:`,
      currentEmployee.isVoiceActive
        ? currentEmployee.isMuted
          ? "Muted"
          : "Active"
        : "Not in voice chat"
    );

    broadcastEmployeeState();
  });

  // ========================================
  // WEBRTC VOICE SIGNALING
  // ROOM-ISOLATED + RANGE-VALIDATED
  // ========================================

  socket.on("voiceSignal", (payload = {}) => {
    const { targetSocketId, signal } = payload;

    const sender = employees.get(socket.id);

    if (
      !sender ||
      typeof targetSocketId !== "string" ||
      !signal ||
      typeof signal !== "object" ||
      Array.isArray(signal) ||
      targetSocketId === socket.id
    ) {
      return;
    }

    const target = employees.get(targetSocketId);

    if (!target) return;

    // Never relay WebRTC signals between different rooms.
    if (sender.currentRoom !== target.currentRoom) {
      return;
    }

    const allowedSignalTypes = [
      "voice-ready",
      "voice-ready-ack",
      "voice-left",
      "offer",
      "answer",
      "candidate",
    ];

    if (
      typeof signal.type !== "string" ||
      !allowedSignalTypes.includes(signal.type)
    ) {
      return;
    }

    // voice-left is allowed even after the pair moves
    // outside the permitted range, so the other client
    // can clean up its existing WebRTC connection.
    if (signal.type !== "voice-left") {
      const roomInfo = getRoomInfo(sender.currentRoom);

      // Main Workspace requires mutual range permission.
      if (
        roomInfo.voiceMode === "proximity" &&
        !canEmployeesConnectByProximity(sender, target)
      ) {
        return;
      }
    }

    io.to(targetSocketId).emit("voiceSignal", {
      fromSocketId: socket.id,
      signal,
    });
  });

  // ========================================
  // DISCONNECT CLEANUP
  // ========================================

  socket.on("disconnect", () => {
    const disconnectedEmployee = employees.get(socket.id);

    if (disconnectedEmployee) {
      saveEmployeePosition(disconnectedEmployee);
    }

    employees.delete(socket.id);

    console.log(
      `${disconnectedEmployee?.name || "Employee"} disconnected. Position preserved.`
    );

    broadcastEmployeeState();
  });
});

// ==========================================
// START BACKEND SERVER
// ==========================================

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error(
        "MONGODB_URI is missing from server/.env"
      );
    }

    if (!process.env.JWT_SECRET) {
      throw new Error(
        "JWT_SECRET is missing from server/.env"
      );
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log(
      "MongoDB Atlas connected successfully!"
    );

    const indexes =
      await UserLocation.collection.indexes();

    for (const index of indexes) {
      if (
        index.name !== "_id_" &&
        index.key &&
        index.key.location
      ) {
        await UserLocation.collection.dropIndex(
          index.name
        );

        console.log(
          `Removed old location index: ${index.name}`
        );
      }
    }

    await UserLocation.collection.createIndex(
      { userId: 1 },
      { unique: true }
    );

    console.log(
      "Virtual-office location model ready."
    );

    server.listen(PORT, () => {
      console.log(
        `ProxiSpeak server running on http://localhost:${PORT}`
      );

      console.log(
        `Virtual office: ${OFFICE_WIDTH} x ${OFFICE_HEIGHT} pixels`
      );

      console.log(
        `Workspace voice ranges: ${ALLOWED_VOICE_RANGES.join("px / ")}px`
      );

      console.log(
        `Collision distance: ${COLLISION_DISTANCE} pixels`
      );

      console.log("JWT authentication: enabled");
      console.log("Employee identity source: MongoDB");
      console.log("Authentication API: /api/auth");

      console.log("Multi-room system: enabled");
      console.log("Available rooms:", Object.keys(ROOMS).join(", "));

      console.log(
        "Workspace voice: mutual 75px / 120px proximity"
      );

      console.log(
        "Meeting room voice: unrestricted group"
      );

      console.log(
        "Room-specific avatar positions: enabled"
      );

      console.log(
        "Room-specific collision detection: enabled"
      );

      console.log(
        "Room-isolated WebRTC signaling: enabled"
      );

      console.log(
        "Spatial audit source: live room positions"
      );

      console.log("WebRTC signaling: enabled");
      console.log("Live voice status tracking: enabled");
      console.log("Avatar collision detection: enabled");
      console.log("Real-time office chat: enabled");

      console.log(
        "Chat message storage: disabled (temporary)"
      );
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
  }
}

startServer();