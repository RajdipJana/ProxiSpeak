
const express = require("express");
const mongoose = require("mongoose");

const Meeting = require("../models/Meeting");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateToken);

// ==========================================
// SOCKET.IO HELPERS
// ==========================================

function getIO(req) {
  return req.app.get("io");
}

function getMeetingRoom(meetingId) {
  return `meeting:${meetingId}`;
}

function getEmployeeRoom(employeeId) {
  return `employee:${employeeId}`;
}

function getTeamRoom(teamId) {
  return `team:${teamId}`;
}

function getActiveParticipants(meeting) {
  return meeting.participants
    .filter((participant) => !participant.leftAt)
    .map((participant) => ({
      employeeId: participant.employeeId,
      name: participant.name,
      joinedAt: participant.joinedAt,
    }));
}

function emitMeetingEvent(req, meetingId, event, data) {
  const io = getIO(req);

  if (io) {
    io.to(getMeetingRoom(meetingId)).emit(event, data);
  }
}

function emitEmployeeEvent(req, employeeId, event, data) {
  const io = getIO(req);

  if (io) {
    io.to(getEmployeeRoom(employeeId)).emit(event, data);
  }
}

function emitTeamEvent(req, teamId, event, data) {
  const io = getIO(req);

  if (io) {
    io.to(getTeamRoom(teamId)).emit(event, data);
  }
}

// ==========================================
// WORKSPACE PRESENCE RESTORATION
// ==========================================

async function restoreEmployeeMeetingPresence(
  req,
  employeeId,
  meetingId
) {
  const restore = req.app.get("restoreMeetingPresence");

  if (typeof restore === "function") {
    return await restore(employeeId, meetingId);
  }

  return 0;
}

async function restoreAllMeetingPresence(req, meetingId) {
  const restore = req.app.get("restoreMeetingPresenceForMeeting");

  if (typeof restore === "function") {
    return await restore(meetingId);
  }

  return 0;
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getEmployeeDetails(employee) {
  return {
    employeeId: employee.employeeId,
    name: employee.name,
    teamId: employee.teamId || null,
    teamName: employee.teamName || null,
  };
}

function isHost(meeting, employee) {
  return meeting.hostEmployeeId === employee.employeeId;
}

function isSameTeam(meeting, employee) {
  return Boolean(
    employee.teamId &&
    meeting.teamId === employee.teamId
  );
}

function hasApprovedAccess(meeting, employee) {
  return meeting.accessRequests.some(
    (request) =>
      request.employeeId === employee.employeeId &&
      request.status === "approved"
  );
}

function isParticipant(meeting, employee) {
  return meeting.participants.some(
    (participant) =>
      participant.employeeId === employee.employeeId &&
      !participant.leftAt
  );
}

function canAccessMeeting(meeting, employee) {
  return (
    isHost(meeting, employee) ||
    isSameTeam(meeting, employee) ||
    hasApprovedAccess(meeting, employee)
  );
}

function validateMeetingId(meetingId) {
  return mongoose.Types.ObjectId.isValid(meetingId);
}

// ==========================================
// GET TEAM MEETINGS
// GET /api/meetings
// ==========================================

router.get("/", async (req, res) => {
  try {
    const employee = req.employee;

    if (!employee.teamId) {
      return res.status(400).json({
        success: false,
        message: "You are not assigned to a team.",
      });
    }

    const meetings = await Meeting.find({
      teamId: employee.teamId,
    })
      .sort({
        scheduledAt: 1,
        createdAt: -1,
      })
      .lean();

    return res.json({
      success: true,
      meetings,
    });
  } catch (error) {
    console.error("Fetch meetings error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch meetings.",
    });
  }
});

// ==========================================
// CREATE INSTANT OR SCHEDULED MEETING
// POST /api/meetings
// ==========================================

router.post("/", async (req, res) => {
  try {
    const employee = req.employee;

    const {
      title,
      description = "",
      meetingType,
      scheduledAt,
    } = req.body;

    if (!employee.teamId || !employee.teamName) {
      return res.status(400).json({
        success: false,
        message: "You must belong to a team to create meetings.",
      });
    }

    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 120
    ) {
      return res.status(400).json({
        success: false,
        message: "Meeting title is required and must be under 120 characters.",
      });
    }

    if (
      typeof description !== "string" ||
      description.length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Meeting description must be under 1000 characters.",
      });
    }

    if (!["instant", "scheduled"].includes(meetingType)) {
      return res.status(400).json({
        success: false,
        message: "Meeting type must be instant or scheduled.",
      });
    }

    let meetingDate = null;

    if (meetingType === "scheduled") {
      meetingDate = new Date(scheduledAt);

      if (
        !scheduledAt ||
        Number.isNaN(meetingDate.getTime()) ||
        meetingDate <= new Date()
      ) {
        return res.status(400).json({
          success: false,
          message: "Please select a valid future meeting date and time.",
        });
      }
    }

    const instantMeeting = meetingType === "instant";

    const meeting = await Meeting.create({
      title: title.trim(),
      description: description.trim(),

      hostEmployeeId: employee.employeeId,
      hostName: employee.name,

      teamId: employee.teamId,
      teamName: employee.teamName,

      meetingType,
      scheduledAt: meetingDate,

      status: instantMeeting ? "live" : "scheduled",

      startedAt: instantMeeting ? new Date() : null,

      participants: instantMeeting
        ? [
            {
              employeeId: employee.employeeId,
              name: employee.name,
              joinedAt: new Date(),
              leftAt: null,
            },
          ]
        : [],
    });

    emitTeamEvent(req, employee.teamId, "meetingCreated", {
      meetingId: meeting._id.toString(),
      title: meeting.title,
      hostEmployeeId: employee.employeeId,
      hostName: employee.name,
      teamId: meeting.teamId,
      teamName: meeting.teamName,
      meetingType: meeting.meetingType,
      scheduledAt: meeting.scheduledAt,
      status: meeting.status,
    });

    return res.status(201).json({
      success: true,
      message: instantMeeting
        ? "Instant meeting created successfully."
        : "Meeting scheduled successfully.",
      meeting,
    });
  } catch (error) {
    console.error("Create meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create meeting.",
    });
  }
});

// ==========================================
// GET MEETING DETAILS
// GET /api/meetings/:meetingId
// ==========================================

router.get("/:meetingId", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const employee = req.employee;

    if (!validateMeetingId(meetingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
    }

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    if (!canAccessMeeting(meeting, employee)) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this meeting.",
      });
    }

    const meetingData = meeting.toObject();

    if (!isHost(meeting, employee)) {
      meetingData.accessRequests = [];
    }

    return res.json({
      success: true,
      meeting: meetingData,
    });
  } catch (error) {
    console.error("Get meeting details error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch meeting details.",
    });
  }
});

// ==========================================
// START A SCHEDULED MEETING
// POST /api/meetings/:meetingId/start
// ==========================================

router.post("/:meetingId/start", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const employee = req.employee;

    if (!validateMeetingId(meetingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
    }

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    if (!isHost(meeting, employee)) {
      return res.status(403).json({
        success: false,
        message: "Only the meeting host can start this meeting.",
      });
    }

    if (meeting.status !== "scheduled") {
      return res.status(400).json({
        success: false,
        message: "This meeting cannot be started.",
      });
    }

    meeting.status = "live";
    meeting.startedAt = new Date();

    meeting.participants.push({
      employeeId: employee.employeeId,
      name: employee.name,
      joinedAt: new Date(),
      leftAt: null,
    });

    await meeting.save();

    emitTeamEvent(req, meeting.teamId, "meetingStarted", {
      meetingId: meeting._id.toString(),
      title: meeting.title,
      hostEmployeeId: employee.employeeId,
      hostName: employee.name,
      status: meeting.status,
      startedAt: meeting.startedAt,
    });

    return res.json({
      success: true,
      message: "Meeting started successfully.",
      meeting,
    });
  } catch (error) {
    console.error("Start meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to start meeting.",
    });
  }
});

// ==========================================
// JOIN A LIVE MEETING
// POST /api/meetings/:meetingId/join
// ==========================================

router.post("/:meetingId/join", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const employee = req.employee;

    if (!validateMeetingId(meetingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
    }

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    if (meeting.status !== "live") {
      return res.status(400).json({
        success: false,
        message: "This meeting is not currently live.",
      });
    }

    if (!canAccessMeeting(meeting, employee)) {
      return res.status(403).json({
        success: false,
        message: "You need host approval to join this meeting.",
      });
    }

    const participant = meeting.participants.find(
      (item) => item.employeeId === employee.employeeId
    );

    const joinedAt = new Date();

    if (participant) {
      participant.name = employee.name;
      participant.joinedAt = joinedAt;
      participant.leftAt = null;
    } else {
      meeting.participants.push({
        employeeId: employee.employeeId,
        name: employee.name,
        joinedAt,
        leftAt: null,
      });
    }

    await meeting.save();

    const participantData = {
      employeeId: employee.employeeId,
      name: employee.name,
      joinedAt,
    };

    emitMeetingEvent(
      req,
      meetingId,
      "meetingParticipantJoined",
      {
        meetingId,
        participant: participantData,
        participants: getActiveParticipants(meeting),
      }
    );

    return res.json({
      success: true,
      message: "Joined meeting successfully.",
      meeting,
    });
  } catch (error) {
    console.error("Join meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to join meeting.",
    });
  }
});

// ==========================================
// LEAVE A MEETING
// POST /api/meetings/:meetingId/leave
// ==========================================

router.post("/:meetingId/leave", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const employee = req.employee;

    if (!validateMeetingId(meetingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
    }

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    const participant = meeting.participants.find(
      (item) => item.employeeId === employee.employeeId
    );

    let leftAt = null;

    if (participant && !participant.leftAt) {
      leftAt = new Date();
      participant.leftAt = leftAt;

      await meeting.save();

      emitMeetingEvent(
        req,
        meetingId,
        "meetingParticipantLeft",
        {
          meetingId,
          employeeId: employee.employeeId,
          name: employee.name,
          leftAt,
          participants: getActiveParticipants(meeting),
        }
      );
    }

    // Restore this employee's workspace presence.
    // This also clears activeMeetingId in server.js,
    // removes their sockets from the meeting room,
    // and broadcasts the updated employee list.

    const restoredSockets = await restoreEmployeeMeetingPresence(
      req,
      employee.employeeId,
      meetingId
    );

    // Fallback cleanup if the restoration helper is unavailable
    // or no matching active meeting socket was found.

    if (!restoredSockets) {
      const io = getIO(req);

      if (io) {
        io.in(getEmployeeRoom(employee.employeeId))
          .socketsLeave(getMeetingRoom(meetingId));
      }
    }

    return res.json({
      success: true,
      message: "You left the meeting.",
    });
  } catch (error) {
    console.error("Leave meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to leave meeting.",
    });
  }
});

// ==========================================
// REQUEST ACCESS TO ANOTHER TEAM'S MEETING
// POST /api/meetings/:meetingId/access-requests
// ==========================================

router.post("/:meetingId/access-requests", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const employee = req.employee;

    if (!validateMeetingId(meetingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
    }

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    if (meeting.status !== "live") {
      return res.status(400).json({
        success: false,
        message: "Access can only be requested for a live meeting.",
      });
    }

    if (isSameTeam(meeting, employee)) {
      return res.status(400).json({
        success: false,
        message: "You already belong to this meeting's team.",
      });
    }

    if (isHost(meeting, employee)) {
      return res.status(400).json({
        success: false,
        message: "You are already the meeting host.",
      });
    }

    if (hasApprovedAccess(meeting, employee)) {
      return res.status(400).json({
        success: false,
        message: "You have already been approved for this meeting.",
      });
    }

    if (isParticipant(meeting, employee)) {
      return res.status(400).json({
        success: false,
        message: "You are already in this meeting.",
      });
    }

    const existingRequest = meeting.accessRequests.find(
      (request) => request.employeeId === employee.employeeId
    );

    if (existingRequest?.status === "pending") {
      return res.status(409).json({
        success: false,
        message: "Your access request is already pending.",
      });
    }

    if (existingRequest) {
      existingRequest.status = "pending";
      existingRequest.requestedAt = new Date();
      existingRequest.name = employee.name;
      existingRequest.teamId = employee.teamId || null;
      existingRequest.teamName = employee.teamName || null;
    } else {
      meeting.accessRequests.push({
        ...getEmployeeDetails(employee),
        status: "pending",
        requestedAt: new Date(),
      });
    }

    await meeting.save();

    emitEmployeeEvent(
      req,
      meeting.hostEmployeeId,
      "meetingAccessRequest",
      {
        meetingId,
        meetingTitle: meeting.title,
        requester: getEmployeeDetails(employee),
        requestedAt: new Date(),
      }
    );

    return res.status(201).json({
      success: true,
      message: "Access request sent to the meeting host.",
    });
  } catch (error) {
    console.error("Access request error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to send access request.",
    });
  }
});

// ==========================================
// APPROVE OR REJECT ACCESS REQUEST
// PATCH /api/meetings/:meetingId/access-requests/:employeeId
// ==========================================

router.patch(
  "/:meetingId/access-requests/:employeeId",
  async (req, res) => {
    try {
      const { meetingId, employeeId } = req.params;
      const { decision } = req.body;
      const employee = req.employee;

      if (!validateMeetingId(meetingId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid meeting ID.",
        });
      }

      if (!["approved", "rejected"].includes(decision)) {
        return res.status(400).json({
          success: false,
          message: "Decision must be approved or rejected.",
        });
      }

      const meeting = await Meeting.findById(meetingId);

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: "Meeting not found.",
        });
      }

      if (!isHost(meeting, employee)) {
        return res.status(403).json({
          success: false,
          message: "Only the meeting host can manage access requests.",
        });
      }

      if (meeting.status !== "live") {
        return res.status(400).json({
          success: false,
          message: "This meeting is no longer live.",
        });
      }

      const accessRequest = meeting.accessRequests.find(
        (request) => request.employeeId === employeeId
      );

      if (!accessRequest || accessRequest.status !== "pending") {
        return res.status(404).json({
          success: false,
          message: "Pending access request not found.",
        });
      }

      accessRequest.status = decision;

      await meeting.save();

      emitEmployeeEvent(
        req,
        employeeId,
        "meetingAccessDecision",
        {
          meetingId,
          meetingTitle: meeting.title,
          decision,
          hostEmployeeId: employee.employeeId,
          hostName: employee.name,
        }
      );

      return res.json({
        success: true,
        message:
          decision === "approved"
            ? "Access request approved."
            : "Access request rejected.",
        meeting,
      });
    } catch (error) {
      console.error("Manage access request error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to update access request.",
      });
    }
  }
);

// ==========================================
// END A MEETING
// POST /api/meetings/:meetingId/end
// ==========================================

router.post("/:meetingId/end", async (req, res) => {
  try {
    const { meetingId } = req.params;
    const employee = req.employee;

    if (!validateMeetingId(meetingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid meeting ID.",
      });
    }

    const meeting = await Meeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found.",
      });
    }

    if (!isHost(meeting, employee)) {
      return res.status(403).json({
        success: false,
        message: "Only the meeting host can end this meeting.",
      });
    }

    if (meeting.status === "ended") {
      return res.status(400).json({
        success: false,
        message: "This meeting has already ended.",
      });
    }

    const endedAt = new Date();

    meeting.status = "ended";
    meeting.endedAt = endedAt;

    meeting.participants.forEach((participant) => {
      if (!participant.leftAt) {
        participant.leftAt = endedAt;
      }
    });

    await meeting.save();

    // Notify everyone currently connected to this meeting.
    emitMeetingEvent(
      req,
      meetingId,
      "meetingEnded",
      {
        meetingId,
        title: meeting.title,
        hostEmployeeId: employee.employeeId,
        hostName: employee.name,
        endedAt,
        status: "ended",
      }
    );

    // Restore every participant's workspace presence.
    // This clears activeMeetingId, removes meeting socket
    // memberships, and broadcasts the updated workspace.

    const restoredSockets = await restoreAllMeetingPresence(
      req,
      meetingId
    );

    // Fallback cleanup for any remaining meeting-room sockets.

    const io = getIO(req);

    if (io) {
      io.in(getMeetingRoom(meetingId))
        .socketsLeave(getMeetingRoom(meetingId));
    }

    // Notify the team as well.
    emitTeamEvent(req, meeting.teamId, "meetingEnded", {
      meetingId,
      title: meeting.title,
      endedAt,
      status: "ended",
    });

    return res.json({
      success: true,
      message: "Meeting ended successfully.",
      meeting,
    });
  } catch (error) {
    console.error("End meeting error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to end meeting.",
    });
  }
});

module.exports = router;
