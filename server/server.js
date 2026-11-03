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

const VOICE_RANGE = 120;
const TARGET_QUERY_TIME_MS = 20;
const CLUSTER_DISTANCE_PIXELS = 100;

const COLLISION_DISTANCE = 20;

// Currently connected Socket.IO sessions.
const employees = new Map();

// Preserve positions across reconnections.
// Key: employeeId, Value: { x, y }
const employeePositions = new Map();

// ==========================================
// SOCKET JWT AUTHENTICATION
// ==========================================

// Every Socket.IO connection must have a valid JWT.
// Employee identity is loaded from MongoDB.

io.use(async (socket, next) => {
  try {
    const auth = socket.handshake.auth || {};
    const token = auth.token;

    if (typeof token !== "string" || !token.trim()) {
      return next(new Error("Authentication required. Please log in."));
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

    // Store trusted database identity on this socket.
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

    next(new Error("Invalid or expired login session. Please log in again."));
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
// COLLISION DETECTION
// ==========================================

function isPositionAvailable(x, y, excludeSocketId = null) {
  for (const employee of employees.values()) {
    if (employee.socketId === excludeSocketId) {
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
// ==========================================

function findFreePosition(preferredX, preferredY) {
  const x = Math.max(30, Math.min(OFFICE_WIDTH - 30, preferredX));
  const y = Math.max(30, Math.min(OFFICE_HEIGHT - 30, preferredY));

  if (isPositionAvailable(x, y)) {
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

      if (isPositionAvailable(candidateX, candidateY)) {
        return {
          x: candidateX,
          y: candidateY,
        };
      }
    }
  }

  // Final fallback: scan the office in a grid.
  for (let gridY = 30; gridY <= OFFICE_HEIGHT - 30; gridY += step) {
    for (let gridX = 30; gridX <= OFFICE_WIDTH - 30; gridX += step) {
      if (isPositionAvailable(gridX, gridY)) {
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
// ==========================================

function resolveMovement(employee, targetX, targetY) {
  const currentX = employee.x;
  const currentY = employee.y;

  const nextX = Math.max(
    30,
    Math.min(OFFICE_WIDTH - 30, targetX)
  );

  const nextY = Math.max(
    30,
    Math.min(OFFICE_HEIGHT - 30, targetY)
  );

  // First try the complete movement.
  if (
    isPositionAvailable(
      nextX,
      nextY,
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
    employee.socketId
  );

  const verticalAvailable = isPositionAvailable(
    currentX,
    nextY,
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
    voiceRangePixels: VOICE_RANGE,
    collisionDistancePixels: COLLISION_DISTANCE,
    connectedEmployees: employees.size,
    cachedEmployeePositions: employeePositions.size,
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
        $in: demoEmployees.map((employee) => employee.userId),
      },
    });

    await UserLocation.insertMany(demoEmployees);

    res.json({
      success: true,
      message: "Virtual-office demo data inserted successfully.",
      note: "These are fixed database test records, not live positions.",
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
// SPATIAL AUDIT — LIVE POSITIONS
// ==========================================

app.get("/api/spatial-audit", (req, res) => {
  const requestStart = performance.now();

  try {
    const x = Number(req.query.x ?? 400);
    const y = Number(req.query.y ?? 250);
    const radius = Number(req.query.radius ?? 500);

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

    const liveEmployees = Array.from(employees.values()).map(
      (employee) => ({
        userId: employee.userId,
        name: employee.name,
        socketId: employee.socketId,
        x: employee.x,
        y: employee.y,
      })
    );

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
          distancePixels: Number(exactDistance.toFixed(2)),
          exactDistance,
        };
      })
      .filter((employee) => employee.exactDistance <= radius)
      .sort((a, b) => a.exactDistance - b.exactDistance)
      .map(({ exactDistance, ...employee }) => employee);

    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < nearbyEmployees.length; i++) {
      if (assigned.has(i)) continue;

      const cluster = [];
      const queue = [i];

      assigned.add(i);

      while (queue.length > 0) {
        const currentIndex = queue.shift();
        const currentEmployee = nearbyEmployees[currentIndex];

        cluster.push(currentEmployee);

        for (let j = 0; j < nearbyEmployees.length; j++) {
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
      dataSource: "Live Socket.IO virtual-office positions",
      coordinateSystem: "Virtual office pixels (x, y)",
      searchCenter: { x, y },
      radiusPixels: radius,
      clusterDistancePixels: CLUSTER_DISTANCE_PIXELS,
      collisionDistancePixels: COLLISION_DISTANCE,
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
        queryWithinTarget: queryTimeMs < TARGET_QUERY_TIME_MS,
        totalWithinTarget: totalProcessingMs < TARGET_QUERY_TIME_MS,
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
// BROADCAST EMPLOYEE STATE
// ==========================================

function broadcastEmployeeState() {
  const employeeList = Array.from(employees.values());

  io.emit("employeesUpdate", employeeList);

  for (const socket of io.sockets.sockets.values()) {
    const currentEmployee = employees.get(socket.id);

    if (!currentEmployee) continue;

    const nearbyEmployees = employeeList
      .filter((employee) => employee.socketId !== socket.id)
      .map((employee) => ({
        ...employee,
        distance: Number(
          distanceBetweenEmployees(
            currentEmployee,
            employee
          ).toFixed(2)
        ),
      }))
      .filter((employee) => employee.distance <= VOICE_RANGE);

    socket.emit("proximityUpdate", {
      nearbyEmployees,
      voiceRange: VOICE_RANGE,
    });
  }
}

// ==========================================
// SOCKET CONNECTIONS
// ==========================================

io.on("connection", (socket) => {
  // Identity comes from the authenticated MongoDB employee.
  // Do not trust userId or name sent by the frontend.

  const authenticatedEmployee = socket.data.employee;

  const userId = authenticatedEmployee.userId;
  const name = authenticatedEmployee.name;

  // Restore previous position if available.
  const savedPosition = employeePositions.get(userId);

  const preferredX = savedPosition ? savedPosition.x : 400;
  const preferredY = savedPosition ? savedPosition.y : 250;

  // Find a free position for this employee.
  const spawnPosition = findFreePosition(
    preferredX,
    preferredY
  );

  if (!spawnPosition) {
    console.log(`Office full. Connection rejected: ${name}`);

    socket.emit("officeFull", {
      message: "The virtual office is currently full.",
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
    x: spawnPosition.x,
    y: spawnPosition.y,
    isVoiceActive: false,
    isMuted: false,
  };

  employees.set(socket.id, employee);

  employeePositions.set(userId, {
    x: employee.x,
    y: employee.y,
  });

  console.log(
    `${name} (${userId}) connected (${socket.id}) at X:${employee.x}, Y:${employee.y}`
  );

  broadcastEmployeeState();

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

    employeePositions.set(currentEmployee.userId, {
      x: currentEmployee.x,
      y: currentEmployee.y,
    });

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
      `${currentEmployee.name} voice status:`,
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
  // ========================================

  socket.on("voiceSignal", (payload = {}) => {
    const { targetSocketId, signal } = payload;

    if (
      typeof targetSocketId !== "string" ||
      !signal ||
      targetSocketId === socket.id ||
      !employees.has(targetSocketId)
    ) {
      return;
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

    employees.delete(socket.id);

    // Keep employeePositions intact.
    // This preserves positions across reconnections.

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

    console.log("MongoDB Atlas connected successfully!");

    const indexes = await UserLocation.collection.indexes();

    for (const index of indexes) {
      if (
        index.name !== "_id_" &&
        index.key &&
        index.key.location
      ) {
        await UserLocation.collection.dropIndex(index.name);
        console.log(`Removed old location index: ${index.name}`);
      }
    }

    await UserLocation.collection.createIndex(
      { userId: 1 },
      { unique: true }
    );

    console.log("Virtual-office location model ready.");

    server.listen(PORT, () => {
      console.log(
        `ProxiSpeak server running on http://localhost:${PORT}`
      );

      console.log(
        `Virtual office: ${OFFICE_WIDTH} x ${OFFICE_HEIGHT} pixels`
      );

      console.log(`Voice range: ${VOICE_RANGE} pixels`);
      console.log(`Collision distance: ${COLLISION_DISTANCE} pixels`);
      console.log("JWT authentication: enabled");
      console.log("Employee identity source: MongoDB");
      console.log("Authentication API: /api/auth");
      console.log("Spatial audit source: live connected employees");
      console.log("WebRTC signaling: enabled");
      console.log("Live voice status tracking: enabled");
      console.log("Employee position restoration: enabled");
      console.log("Avatar collision detection: enabled");
    });
  } catch (error) {
    console.error("Server startup failed:", error);
    process.exitCode = 1;
  }
}

startServer();