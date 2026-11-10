
const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    leftAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const accessRequestSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    teamId: {
      type: String,
      default: null,
    },
    teamName: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    hostEmployeeId: {
      type: String,
      required: true,
      index: true,
    },

    hostName: {
      type: String,
      required: true,
    },

    teamId: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    teamName: {
      type: String,
      required: true,
      trim: true,
    },

    meetingType: {
      type: String,
      enum: ["instant", "scheduled"],
      required: true,
    },

    scheduledAt: {
      type: Date,
      default: null,
    },

    status: {
      type: String,
      enum: ["scheduled", "live", "ended"],
      default: "scheduled",
      index: true,
    },

    participants: {
      type: [participantSchema],
      default: [],
    },

    accessRequests: {
      type: [accessRequestSchema],
      default: [],
    },

    startedAt: {
      type: Date,
      default: null,
    },

    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Useful for retrieving a team's meetings in date order.
meetingSchema.index({ teamId: 1, scheduledAt: 1 });

// Avoid OverwriteModelError during development.
module.exports =
  mongoose.models.Meeting ||
  mongoose.model("Meeting", meetingSchema);
