const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const path = require("path");

const Employee = require("../models/Employee");

// Load environment variables from server/.env
dotenv.config({
  path: path.join(__dirname, "../.env"),
});

// Demo employee accounts
const demoEmployees = [
  {
    employeeId: "PS-001",
    name: "Dona Mondal",
    department: "Development",
  },
  {
    employeeId: "PS-002",
    name: "Rajdip Jana",
    department: "Development",
  },
  {
    employeeId: "PS-003",
    name: "Rithvik kolipaka",
    department: "Development",
  },
  {
    employeeId: "PS-004",
    name: "Abdul Muhyee",
    department: "Development",
  },
];

// Temporary common password for the demo accounts.
const DEMO_PASSWORD = "123456";

async function seedEmployees() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from server/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    console.log("MongoDB Atlas connected.");

    // Hash the demo password before storing it.
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    for (const employee of demoEmployees) {
      const result = await Employee.updateOne(
        { employeeId: employee.employeeId },
        {
            $set: {
            name: employee.name,
            department: employee.department,
            },
            $setOnInsert: {
            passwordHash,
            role: "employee",
            isActive: true,
            },
        },
        { upsert: true }
        );

      if (result.upsertedCount > 0) {
        console.log(`Created: ${employee.employeeId} - ${employee.name}`);
      } else {
        console.log(`Already exists: ${employee.employeeId}`);
      }
    }

    console.log("\nDemo employee seeding completed!");
    console.log("Initial demo password: 123456");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("MongoDB connection closed.");
  }
}

seedEmployees();