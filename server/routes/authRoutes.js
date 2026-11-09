
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Employee = require("../models/Employee");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// EMPLOYEE LOGIN
// ==========================================

router.post("/login", async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (
      typeof employeeId !== "string" ||
      typeof password !== "string" ||
      !employeeId.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Employee ID and password are required.",
      });
    }

    const employee = await Employee.findOne({
      employeeId: employeeId.trim().toUpperCase(),
    });

    if (!employee || !employee.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid Employee ID or password.",
      });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(
      password,
      employee.passwordHash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid Employee ID or password.",
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: employee._id.toString(),
        employeeId: employee.employeeId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    return res.json({
      success: true,
      message: "Login successful.",
      token,

      user: {
        id: employee._id,
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role,
        department: employee.department,

        // Team information
        teamId: employee.teamId || null,
        teamName: employee.teamName || null,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
});

// ==========================================
// CHANGE EMPLOYEE PASSWORD
// ==========================================

router.post(
  "/change-password",
  authenticateToken,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (
        typeof currentPassword !== "string" ||
        typeof newPassword !== "string" ||
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          success: false,
          message: "Both passwords are required.",
        });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: "New password must contain at least 8 characters.",
        });
      }

      if (newPassword === currentPassword) {
        return res.status(400).json({
          success: false,
          message:
            "New password must be different from the current password.",
        });
      }

      const employee = await Employee.findById(req.employee._id);

      if (!employee || !employee.isActive) {
        return res.status(401).json({
          success: false,
          message: "Employee account is unavailable.",
        });
      }

      const passwordMatch = await bcrypt.compare(
        currentPassword,
        employee.passwordHash
      );

      if (!passwordMatch) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect.",
        });
      }

      employee.passwordHash = await bcrypt.hash(newPassword, 12);

      await employee.save();

      return res.json({
        success: true,
        message: "Password changed successfully.",
      });
    } catch (error) {
      console.error("Password change error:", error);

      return res.status(500).json({
        success: false,
        message: "Unable to change password. Please try again.",
      });
    }
  }
);

module.exports = router;
