
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("path");

const Employee = require("../models/Employee");

// Load server/.env
dotenv.config({
  path: path.join(__dirname, "../.env"),
});

// Demo team assignments
const assignments = [
  {
    employeeId: "PS-001",
    name: "Dona Mondal",
    teamId: "TEAM-ALPHA",
    teamName: "Team Alpha",
  },
  {
    employeeId: "PS-002",
    name: "Rajdip Jana",
    teamId: "TEAM-ALPHA",
    teamName: "Team Alpha",
  },
  {
    employeeId: "PS-003",
    name: "Rithvik Kolipaka",
    teamId: "TEAM-BETA",
    teamName: "Team Beta",
  },
  {
    employeeId: "PS-004",
    name: "Abdul Muhyee",
    teamId: "TEAM-BETA",
    teamName: "Team Beta",
  },
];

async function assignDemoTeams() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from server/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("\nConnected to MongoDB.");
    console.log("Checking employee records...\n");

    // Verify all employees before changing anything
    const employeeIds = assignments.map((item) => item.employeeId);

    const employees = await Employee.find({
      employeeId: { $in: employeeIds },
    });

    const employeeMap = new Map(
      employees.map((employee) => [
        employee.employeeId.toUpperCase(),
        employee,
      ])
    );

    const errors = [];

    for (const assignment of assignments) {
      const employee = employeeMap.get(assignment.employeeId);

      if (!employee) {
        errors.push(
          `${assignment.employeeId}: Employee record not found`
        );
        continue;
      }

      if (
        employee.name.trim().toLowerCase() !==
        assignment.name.trim().toLowerCase()
      ) {
        errors.push(
          `${assignment.employeeId}: Expected "${assignment.name}", found "${employee.name}"`
        );
      }
    }

    // Stop without updating if any record is incorrect
    if (errors.length > 0) {
      console.error("Verification failed. No changes were made.");

      errors.forEach((error) => console.error(" - " + error));

      return;
    }

    console.log("All four employee records verified.");
    console.log("Assigning demo teams...\n");

    // Update only team fields; preserve passwords and other data
    for (const assignment of assignments) {
      await Employee.updateOne(
        { employeeId: assignment.employeeId },
        {
          $set: {
            teamId: assignment.teamId,
            teamName: assignment.teamName,
          },
        }
      );

      console.log(
        `${assignment.name} (${assignment.employeeId}) -> ${assignment.teamName}`
      );
    }

    console.log("\nDemo team assignments completed successfully!");
  } catch (error) {
    console.error("Team assignment failed:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB connection closed.");
  }
}

assignDemoTeams();
