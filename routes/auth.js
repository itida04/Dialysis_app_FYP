import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/Users.js";
import dotenv from "dotenv";
dotenv.config();

const router = express.Router();

/**
 * POST /register
 * body: { name, email, phone, password, role, doctorId? }
 * If role is patient, doctorId must be provided (who registered the patient)
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, role, doctorId } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!["doctor","patient"].includes(role)) return res.status(400).json({ message: "Invalid role" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "Email already in use" });

    if (role === "patient" && !doctorId) {
      return res.status(400).json({ message: "Patient must have doctorId" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = new User({ name, email, phone, passwordHash, role, doctorId: doctorId || null });
    await user.save();

    res.json({ success: true, userId: user._id });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /login
 * body: { email, password }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Missing credentials" });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: "8h" });

    res.json({ success: true, token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
