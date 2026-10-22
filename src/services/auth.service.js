// authentication service

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");
const { sendWelcomeEmail } = require("./email.service");

const httpError = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

// role is never taken from the client; "admin" needs the secret registration key
const resolveRole = (adminKey) => {
  if (!adminKey) return "student";

  const expected = process.env.ADMIN_REGISTRATION_KEY;
  const given = Buffer.from(adminKey);
  const wanted = Buffer.from(expected || "");
  if (!expected || given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    throw httpError("Invalid admin registration key", 403);
  }
  return "admin";
};

const register = async ({ name, email, password, adminKey }) => {
  const role = resolveRole(adminKey);

  const exists = await User.findOne({ email });
  if (exists) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
  });

  const token = generateToken({ id: user._id, role: user.role });

  // Send welcome email (non-blocking - don't wait for it)
  sendWelcomeEmail(user.email, user.name).catch(err => {
    console.error('Email sending failed (non-critical):', err.message);
  });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

const login = async ({ email, password }) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("Invalid email or password");

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new Error("Invalid email or password");

  if (user.isBanned) throw httpError("Your account has been banned", 403);

  const token = generateToken({ id: user._id, role: user.role });

  return {
    token,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

const getMe = async (userId) => {
  const user = await User.findById(userId).select("-passwordHash");
  if (!user) throw new Error("User not found");
  return user;
};

module.exports = { register, login, getMe };
