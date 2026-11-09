
const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    // Unique employee ID
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },

    // Employee's full name
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Hashed password
    passwordHash: {
      type: String,
      required: true,
    },

    // Employee role
    role: {
      type: String,
      enum: ["admin", "employee"],
      default: "employee",
    },

    // Department
    department: {
      type: String,
      default: "General",
    },

    // Company-assigned team information
    teamId: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
    },

    teamName: {
      type: String,
      default: null,
      trim: true,
    },

    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Employee", employeeSchema);
