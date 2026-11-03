const jwt = require("jsonwebtoken");
const Employee = require("../models/Employee");

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Check whether the token exists.
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify the JWT.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the employee in MongoDB.
    const employee = await Employee.findById(decoded.id).select(
      "-passwordHash"
    );

    if (!employee || !employee.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid or inactive employee account.",
      });
    }

    // Make employee information available to protected routes.
    req.employee = employee;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
}

module.exports = authenticateToken;