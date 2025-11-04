// routes/uploads.js
import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import Image from "../models/Image.js";
import Session from "../models/Session.js";
import { authMiddleware } from "../middleware/auth.js";
import fs from "fs";
import User from "../models/Users.js";

const router = express.Router();
const upload = multer({ dest: "tmp/" });

/**
 * POST /start-material-session
 * body: { patientId }
 * Auth: doctor
 * → creates a session of type "material"
 */
router.post("/start-material-session", authMiddleware(["doctor"]), async (req, res) => {
  try {
    const { patientId } = req.body;
    const doctorId = req.user.id;

    const session = new Session({ patientId, doctorId, type: "material" });
    await session.save();

    res.json({ success: true, session });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating material session" });
  }
});

/**
 * POST /start-dialysis-session
 * body: none
 * Auth: patient
 * → creates a session of type "dialysis" (for that patient)
 */
router.post("/start-dialysis-session", authMiddleware(["patient"]), async (req, res) => {
  try {
    const patientId = req.user.id;

    // Fetch the user from DB
    const patient = await User.findById(patientId);

    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // Ensure the user is actually a patient
    if (patient.role !== "patient") {
      return res.status(400).json({ message: "Logged-in user is not a patient" });
    }

    const doctorId = patient.doctorId; // doctor assigned to this patient

    if (!doctorId) {
      return res.status(400).json({ message: "No assigned doctor found" });
    }

    // Create a new dialysis session
    const session = new Session({
      patientId,
      doctorId,
      type: "dialysis",
      status: "active"
    });

    await session.save();

    res.json({ success: true, session });
  } catch (err) {
    console.error("Full error:", err);
    res.status(500).json({ message: "Error creating dialysis session", error: err.message });
  }
});


/**
 * POST /upload
 * form-data: image file, sessionId
 * Auth: patient or doctor
 */
router.post("/upload", authMiddleware(), upload.single("image"), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const uploadedBy = req.user.role; // "patient" or "doctor"
    const uploaderId = req.user.id;

    const session = await Session.findById(sessionId);
    if (!session) return res.status(400).json({ message: "Invalid sessionId" });

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "dialysis_app",
      use_filename: true,
      unique_filename: false
    });

    fs.unlinkSync(req.file.path);

    const imageDoc = new Image({
      sessionId,
      uploadedBy,
      uploaderId,
      imageUrl: result.secure_url,
      publicId: result.public_id
    });
    await imageDoc.save();

    res.json({ success: true, image: imageDoc });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

/**
 * GET /session/:id/images
 * Auth: doctor or patient
 * → list all images for a session
 */
router.get("/session/:id/images", authMiddleware(), async (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    // permission checks
    if (req.user.role === "patient" && req.user.id !== String(session.patientId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (req.user.role === "doctor" && req.user.id !== String(session.doctorId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const images = await Image.find({ sessionId });
    res.json({ success: true, images });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /finish-dialysis-session/:sessionId
 * Auth: patient
 * → marks a dialysis session as completed
 */
router.patch("/finish-dialysis-session/:sessionId", authMiddleware(["patient"]), async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Check that the session exists and belongs to this patient
    const session = await Session.findOne({ _id: sessionId, patientId: req.user.id });

    if (!session) {
      return res.status(404).json({ message: "Session not found or unauthorized" });
    }

    // Update session status
    session.status = "completed";
    session.completedAt = new Date();
    await session.save();

    res.json({
      success: true,
      message: "Dialysis session marked as completed",
      session,
    });
  } catch (err) {
    console.error("Error finishing dialysis session:", err);
    res.status(500).json({ message: "Error completing session" });
  }
});



export default router;
