// routes/uploads.js
import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import Image from "../models/Image.js";
import Session from "../models/Session.js";
import { authMiddleware } from "../middleware/auth.js";
import User from "../models/Users.js";

const router = express.Router();

// ✅ 1. Use memory storage instead of disk storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ 2. Cloudinary should already be configured in config/cloudinary.js
// (Make sure you call cloudinary.config() there using process.env vars)

// ------------------- START MATERIAL SESSION -------------------
router.post(
  "/start-material-session",
  authMiddleware(["doctor"]),
  async (req, res) => {
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
  }
);

// ------------------- START DIALYSIS SESSION -------------------
router.post(
  "/start-dialysis-session",
  authMiddleware(["patient"]),
  async (req, res) => {
    try {
      const patientId = req.user.id;
      const patient = await User.findById(patientId);

      if (!patient) return res.status(404).json({ message: "Patient not found" });
      if (patient.role !== "patient")
        return res.status(400).json({ message: "Logged-in user is not a patient" });

      const doctorId = patient.doctorId;
      if (!doctorId)
        return res.status(400).json({ message: "No assigned doctor found" });

      const session = new Session({
        patientId,
        doctorId,
        type: "dialysis",
        status: "active",
      });

      await session.save();
      res.json({ success: true, session });
    } catch (err) {
      console.error("Full error:", err);
      res.status(500).json({ message: "Error creating dialysis session", error: err.message });
    }
  }
);

// ------------------- UPLOAD IMAGE -------------------
router.post("/upload", authMiddleware(), upload.single("image"), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const uploadedBy = req.user.role;
    const uploaderId = req.user.id;

    const session = await Session.findById(sessionId);
    if (!session) return res.status(400).json({ message: "Invalid sessionId" });

    // ✅ Upload from memory → Cloudinary
    const stream = cloudinary.uploader.upload_stream(
      { folder: "dialysis_app", use_filename: true, unique_filename: false },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          return res.status(500).json({ message: "Cloudinary upload failed", error });
        }

        const imageDoc = new Image({
          sessionId,
          uploadedBy,
          uploaderId,
          imageUrl: result.secure_url,
          publicId: result.public_id,
        });
        await imageDoc.save();

        res.json({ success: true, image: imageDoc });
      }
    );

    // ✅ Stream the buffer directly
    streamifier.createReadStream(req.file.buffer).pipe(stream);
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// ------------------- GET SESSION IMAGES -------------------
router.get("/session/:id/images", authMiddleware(), async (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });

    // permission checks
    if (req.user.role === "patient" && req.user.id !== String(session.patientId))
      return res.status(403).json({ message: "Forbidden" });
    if (req.user.role === "doctor" && req.user.id !== String(session.doctorId))
      return res.status(403).json({ message: "Forbidden" });

    const images = await Image.find({ sessionId });
    res.json({ success: true, images });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- FINISH DIALYSIS SESSION -------------------
router.patch(
  "/finish-dialysis-session/:sessionId",
  authMiddleware(["patient"]),
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await Session.findOne({ _id: sessionId, patientId: req.user.id });

      if (!session)
        return res.status(404).json({ message: "Session not found or unauthorized" });

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
  }
);

/**
 * POST /doctor/patients
 * Auth: doctor
 * body: { doctorId }
 * → returns all patients assigned to that doctor
 */
router.post("/doctor/patients", authMiddleware(["doctor"]), async (req, res) => {
  try {
    const { doctorId } = req.body;

    if (!doctorId) {
      return res.status(400).json({ message: "doctorId is required in the request body" });
    }

    // Ensure the logged-in doctor is requesting their own list
    if (req.user.id !== doctorId) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    // Find all patients assigned to this doctor
    const patients = await User.find(
      { doctorId, role: "patient" },
      "name email _id" // select only these fields
    );

    if (!patients.length) {
      return res.json({
        success: true,
        message: "No patients found under this doctor",
        patients: [],
      });
    }

    res.json({
      success: true,
      count: patients.length,
      patients,
    });
  } catch (err) {
    console.error("Error fetching patients:", err);
    res.status(500).json({ message: "Server error" });
  }
});


export default router;
