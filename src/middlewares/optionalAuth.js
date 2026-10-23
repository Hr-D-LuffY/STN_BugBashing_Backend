// like authMiddleware, but a missing or invalid token just means "anonymous"
// (used by public routes whose response depends on who is asking)

const jwt = require("jsonwebtoken");
const User = require("../models/User");

const optionalAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return next();

  const token = header.startsWith("Bearer ") ? header.split(" ")[1] : header;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("role isBanned");
    if (user && !user.isBanned) {
      req.user = { id: String(user._id), role: user.role };
    }
  } catch {
    // invalid or expired token: treat as anonymous
  }
  next();
};

module.exports = optionalAuth;
