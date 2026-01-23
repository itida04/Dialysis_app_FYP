// routes/uploads.js
import express from "express";
import multer from "multer";
//import { v2 as cloudinary } from "cloudinary";
import cloudinary from "../config/cloudinary.js";
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
      const doctorId = req.user.id;
      const { patientId } = req.body;

      if (!patientId) {
        return res.status(400).json({ message: "patientId is required" });
      }

      // Read optional materials info from body (validate / default)
      // expected body keys (all optional except patientId):
      // sessionsCount, dialysisMachine, dialyzer, bloodTubingSets, dialysisNeedles,
      // dialysateConcentrates, heparin, salineSolution

      const {
        sessionsCount = 0,
        dialysisMachine = "none", // "portable" | "standard" | "none"
        dialyzer = false,
        bloodTubingSets = false,
        dialysisNeedles = false,
        dialysateConcentrates = false,
        heparin = false,
        salineSolution = false,
        notes = ""
      } = req.body;

      // basic validation for dialysisMachine
      const validMachines = ["portable", "standard", "none"];
      const machine = validMachines.includes(dialysisMachine) ? dialysisMachine : "none";

      const session = new Session({
        patientId,
        doctorId,
        type: "material",
        status: "active",
        notes,
        materials: {
          sessionsCount: Number(sessionsCount) || 0,
          dialysisMachine: machine,
          dialyzer: Boolean(dialyzer),
          bloodTubingSets: Boolean(bloodTubingSets),
          dialysisNeedles: Boolean(dialysisNeedles),
          dialysateConcentrates: Boolean(dialysateConcentrates),
          heparin: Boolean(heparin),
          salineSolution: Boolean(salineSolution)
        }
      });

      await session.save();

      res.json({ success: true, session });
    } catch (err) {
      console.error("Error creating material session:", err);
      res.status(500).json({ message: "Error creating material session", error: err.message });
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
      const { materialSessionId } = req.body;

      const patient = await User.findById(patientId);
      if (!patient || patient.role !== "patient") {
        return res.status(400).json({ message: "Invalid patient" });
      }

      const doctorId = patient.doctorId;
      if (!doctorId) {
        return res.status(400).json({ message: "No assigned doctor found" });
      }

      // 1️⃣ Validate material session
      const materialSession = await Session.findOne({
        _id: materialSessionId,
        patientId,
        doctorId,
        type: "material",
      });

      if (!materialSession) {
        return res.status(400).json({ message: "Invalid materialSessionId" });
      }

      // 2️⃣ Block parallel active dialysis session (IMPORTANT SAFETY)
      const activeSession = await Session.findOne({
        type: "dialysis",
        patientId,
        doctorId,
        materialSessionId,
        status: "active",
      });

      if (activeSession) {
        return res.status(400).json({
          message:
            "Please complete the current dialysis session before starting a new one",
          activeSessionId: activeSession._id,

        });
      }

      // 3️⃣ Count USED sessions (completed + verified)
      const usedSessions = await Session.countDocuments({
        type: "dialysis",
        patientId,
        doctorId,
        materialSessionId,
        status: { $in: ["completed", "verified"] },
      });

      const totalAllowed = materialSession.materials?.sessionsCount || 0;

      if (usedSessions >= totalAllowed) {
        return res.status(400).json({
          message:
            "All dialysis sessions for this material pack are exhausted. Please collect new material.",
        });
      }

      // 4️⃣ Create dialysis session (NO dayNumber)
      const session = new Session({
        patientId,
        doctorId,
        type: "dialysis",
        status: "active",
        materialSessionId,

      });
      await session.save();

      res.json({ success: true, session });
    } catch (err) {
      console.error("Error starting dialysis session:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);




// ------------------- UPLOAD IMAGE -------------------
router.post("/upload", authMiddleware(), upload.single("image"), async (req, res) => {
  try {
    const { sessionId } = req.body;
    const uploadedBy = req.user.role; // "doctor" or "patient"
    const uploaderId = req.user.id;

    if (!sessionId) {
      return res.status(400).json({ message: "sessionId is required" });
    }

    const session = await Session.findById(sessionId);
    if (!session) return res.status(400).json({ message: "Invalid sessionId" });

    // 🔐 permission checks
    if (uploadedBy === "patient" && String(session.patientId) !== String(uploaderId)) {
      return res.status(403).json({ message: "Forbidden: patient not owner of session" });
    }
    if (uploadedBy === "doctor" && String(session.doctorId) !== String(uploaderId)) {
      return res.status(403).json({ message: "Forbidden: doctor not owner of session" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Image file is required" });
    }

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

    // ✅ Stream the buffer directly (ONLY ONCE)
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
  "/finish-dialysis-session",
  authMiddleware(["patient"]),
  async (req, res) => {
    try {
      const {
        sessionId,

        // Voluntary questions
        feelingOk,
        fever,
        comment,

        // Dialysis parameters
        fillVolume,
        drainVolume,
        fillTime,
        drainTime,
        bloodPressure,
        weightPre,
        weightPost,
        numberOfExchanges,
        durationMinutes
      } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: "sessionId is required" });
      }

      const session = await Session.findOne({
        _id: sessionId,
        patientId: req.user.id
      });

      if (!session) {
        return res
          .status(404)
          .json({ message: "Session not found or unauthorized" });
      }

      // ✅ Mark session as completed
      session.status = "completed";
      session.completedAt = new Date();

      // ✅ Store voluntary + dialysis parameters
      session.parameters = {
        ...(session.parameters || {}),
        voluntary: {
          feelingOk: feelingOk ?? null,
          fever: fever ?? null,
          comment: comment ?? ""
        },
        dialysis: {
          fillVolume: fillVolume ?? null,
          drainVolume: drainVolume ?? null,
          fillTime: fillTime ?? null,
          drainTime: drainTime ?? null,
          bloodPressure: bloodPressure ?? null,
          weightPre: weightPre ?? null,
          weightPost: weightPost ?? null,
          numberOfExchanges: numberOfExchanges ?? null,
          durationMinutes: durationMinutes ?? null
        }
      };

      await session.save();

      res.json({
        success: true,
        message: "Dialysis session marked as completed",
        session
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


/**
 * PATCH /acknowledge-material-session
 * Auth: patient
 * body: { sessionId }
 * → Patient acknowledges receipt of dialysis materials
 */
router.patch(
  "/acknowledge-material-session",
  authMiddleware(["patient"]),
  async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ message: "sessionId is required" });
      }

      // Ensure this session belongs to the patient and is a MATERIAL session
      const session = await Session.findOne({
        _id: sessionId,
        patientId: req.user.id,
        type: "material",
      });

      if (!session) {
        return res
          .status(404)
          .json({ message: "Material session not found or unauthorized" });
      }

      // Update status
      session.status = "acknowledged";
      session.acknowledgedAt = new Date();

      await session.save();

      res.json({
        success: true,
        message: "Material receipt acknowledged by patient",
        session,
      });
    } catch (err) {
      console.error("Error acknowledging material session:", err);
      res.status(500).json({ message: "Error acknowledging material session" });
    }
  }
);

// ------------------- GET SINGLE PATIENT DETAILS -------------------
/**
 * POST /patient/details
 * Auth: doctor or patient
 * body: { patientId }
 * → returns basic details (name, email) of a patient
 */
router.post(
  "/patient/details",
  authMiddleware(["doctor", "patient"]),
  async (req, res) => {
    try {
      const { patientId } = req.body;

      if (!patientId) {
        return res.status(400).json({ message: "patientId is required" });
      }

      // Fetch patient
      const patient = await User.findById(patientId).select(
        "name email _id role doctorId"
      );

      if (!patient || patient.role !== "patient") {
        return res.status(404).json({ message: "Patient not found" });
      }

      // 🔐 Permission checks
      // Patient can see only their own data
      if (req.user.role === "patient" && req.user.id !== String(patient._id)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Doctor can see only assigned patients
      if (
        req.user.role === "doctor" &&
        String(patient.doctorId) !== String(req.user.id)
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json({
        success: true,
        patient: {
          id: patient._id,
          name: patient.name,
          email: patient.email,
        },
      });
    } catch (err) {
      console.error("Error fetching patient details:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);


/**
 * POST /patient/material-summary
 *
 * Auth:
 *  - doctor: must send { patientId } in body, and patient must belong to that doctor
 *  - patient: no body needed, summary is shown for logged-in patient
 */
router.post(
  "/patient/material-summary",
  authMiddleware(["doctor", "patient"]),
  async (req, res) => {
    try {
      let patientId;
      let doctorId = null;

      // 🔹 Decide which patient we’re querying for
      if (req.user.role === "doctor") {
        // doctor must send patientId
        const { patientId: bodyPatientId } = req.body;
        doctorId = req.user.id;
        patientId = bodyPatientId;
      } else {
        // patient sees their own summary (id from token)
        patientId = req.user.id;
      }

      if (!patientId) {
        return res.status(400).json({
          message: "patientId is required for doctor requests",
        });
      }

      // 1) Fetch patient
      const patient = await User.findById(patientId).select(
        "name email doctorId"
      );
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      // 2) If doctor, ensure this patient belongs to them
      if (
        req.user.role === "doctor" &&
        String(patient.doctorId) !== String(doctorId)
      ) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      // 3) For queries, always use patient's doctorId (same for both roles)
      if (!doctorId) {
        doctorId = patient.doctorId;
      }

      // 4) Get all material sessions for this doctor+patient
      const materialSessions = await Session.find({
        doctorId,
        patientId,
        type: "material",
      }).sort({ createdAt: 1 });

      // collect material session IDs
      const materialSessionIds = materialSessions.map((ms) => ms._id);

      // 5) Get all dialysis sessions linked to any material session
      const dialysisSessions = await Session.find({
        doctorId,
        patientId,
        type: "dialysis",
        materialSessionId: { $in: materialSessionIds },
      });

      
      // Group dialysis sessions by materialSessionId
      const dialysisByMaterial = {};
      const dialysisSessionIds = [];

      dialysisSessions.forEach((ds) => {
        const key = String(ds.materialSessionId);
        if (!dialysisByMaterial[key]) dialysisByMaterial[key] = [];
        dialysisByMaterial[key].push(ds);

        dialysisSessionIds.push(ds._id);
      });

      // 6) Fetch images for all dialysis sessions (uploaded by patient)
      const images = await Image.find({
        sessionId: { $in: dialysisSessionIds },
        uploadedBy: "patient",
      }).sort({ uploadedAt: 1 });

      // Group images by sessionId
      const imagesBySession = {};
      images.forEach((img) => {
        const key = String(img.sessionId);
        if (!imagesBySession[key]) imagesBySession[key] = [];
        imagesBySession[key].push({
          id: img._id,
          imageUrl: img.imageUrl,
          uploadedAt: img.uploadedAt,
          publicId: img.publicId,
        });
      });

      // 7) Fetch images for material sessions (uploaded by doctor)
      const materialImages = await Image.find({
        sessionId: { $in: materialSessionIds },
        uploadedBy: "doctor",
      }).sort({ uploadedAt: 1 });

      const materialImagesBySession = {};
      materialImages.forEach((img) => {
        const key = String(img.sessionId);
        if (!materialImagesBySession[key]) materialImagesBySession[key] = [];
        materialImagesBySession[key].push({
          id: img._id,
          imageUrl: img.imageUrl,
          uploadedAt: img.uploadedAt,
          publicId: img.publicId,
        });
      });

      // 8) Build response structure
      const materialSummary = materialSessions.map((ms) => {
      const msId = String(ms._id);
      const totalSessions = ms.materials?.sessionsCount || 0;

      const dialForThisMaterial = dialysisByMaterial[msId] || [];

      const completedSessions = dialForThisMaterial.filter(
        (ds) => ds.status === "completed" || ds.status === "verified"
      ).length;

      const remainingSessions = Math.max(
        totalSessions - completedSessions,
        0
      );

      return {
        materialSessionId: ms._id,
        createdAt: ms.createdAt,
        status: ms.status,
        acknowledgedAt: ms.acknowledgedAt || null,

        materials: ms.materials,

        totalSessionsAllowed: totalSessions,
        completedSessions,
        remainingSessions,

        materialImages: materialImagesBySession[msId] || [],

        dialysisSessions: dialForThisMaterial.map((ds) => ({
          sessionId: ds._id,
          status: ds.status,
          completedAt: ds.completedAt || null,
          parameters: ds.parameters || {},
          images: imagesBySession[String(ds._id)] || [],
        })),
      };
    });

      res.json({
        success: true,
        patient: {
          id: patient._id,
          name: patient.name,
          email: patient.email,
        },
        materialSessions: materialSummary,
      });
    } catch (err) {
      console.error("Error fetching patient material summary:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * PATCH /verify-dialysis-session
 * Auth: doctor
 * body: { sessionId, verificationNotes? }
 * → Doctor verifies a completed dialysis session
 */
router.patch(
  "/verify-dialysis-session",
  authMiddleware(["doctor"]),
  async (req, res) => {
    try {
      const { sessionId, verificationNotes } = req.body;
      const doctorId = req.user.id;

      if (!sessionId) {
        return res.status(400).json({ message: "sessionId is required" });
      }

      // Find the dialysis session
      const session = await Session.findOne({
        _id: sessionId,
        doctorId,
        type: "dialysis",
      });

      if (!session) {
        return res.status(404).json({
          message: "Dialysis session not found or unauthorized",
        });
      }

      // Ensure session is completed before verification
      if (session.status !== "completed") {
        return res.status(400).json({
          message: "Only completed dialysis sessions can be verified",
        });
      }

      // ✅ Mark as verified
      session.status = "verified";
      session.verifiedAt = new Date();
      session.verifiedBy = doctorId;
      session.verificationNotes = verificationNotes || "";

      await session.save();

      res.json({
        success: true,
        message: "Dialysis session verified successfully",
        session,
      });
    } catch (err) {
      console.error("Error verifying dialysis session:", err);
      res.status(500).json({ message: "Error verifying dialysis session" });
    }
  }
);

/**
 * POST /material/session-details
 *
 * Auth:
 *  - doctor → body: { patientId, materialSessionId }
 *  - patient → body: { materialSessionId }
 */
    router.post(
      "/material/session-details",
      authMiddleware(["doctor", "patient"]),
      async (req, res) => {
        try {
          let patientId;
          let doctorId = null;
          const { materialSessionId } = req.body;

          if (!materialSessionId) {
            return res.status(400).json({ message: "materialSessionId is required" });
          }

          if (req.user.role === "doctor") {
            patientId = req.body.patientId;
            doctorId = req.user.id;
            if (!patientId) {
              return res.status(400).json({ message: "patientId is required" });
            }
          } else {
            patientId = req.user.id;
          }

          const materialSession = await Session.findOne({
            _id: materialSessionId,
            patientId,
            type: "material",
          });

          if (!materialSession) {
            return res.status(404).json({ message: "Material session not found" });
          }

          if (
            req.user.role === "doctor" &&
            String(materialSession.doctorId) !== String(doctorId)
          ) {
            return res.status(403).json({ message: "Unauthorized" });
          }

          const dialysisSessions = await Session.find({
            type: "dialysis",
            patientId,
            doctorId: materialSession.doctorId,
            materialSessionId,
          });

          const totalSessions = materialSession.materials?.sessionsCount || 0;

          const completedSessions = dialysisSessions.filter(
            (ds) => ds.status === "completed" || ds.status === "verified"
          ).length;

          const remainingSessions = Math.max(
            totalSessions - completedSessions,
            0
          );

          const dialysisSessionIds = dialysisSessions.map(ds => ds._id);

          const images = await Image.find({
            sessionId: { $in: dialysisSessionIds },
            uploadedBy: "patient",
          });

          const imagesBySession = {};
          images.forEach(img => {
            const key = String(img.sessionId);
            if (!imagesBySession[key]) imagesBySession[key] = [];
            imagesBySession[key].push({
              id: img._id,
              imageUrl: img.imageUrl,
              uploadedAt: img.uploadedAt,
              publicId: img.publicId,
            });
          });

          const materialImages = await Image.find({
            sessionId: materialSessionId,
            uploadedBy: "doctor",
          });

          res.json({
            success: true,
            materialSession: {
              materialSessionId: materialSession._id,
              createdAt: materialSession.createdAt,
              status: materialSession.status,
              acknowledgedAt: materialSession.acknowledgedAt || null,

              materials: materialSession.materials,

              totalSessionsAllowed: totalSessions,
              completedSessions,
              remainingSessions,

              materialImages: materialImages.map(img => ({
                id: img._id,
                imageUrl: img.imageUrl,
                uploadedAt: img.uploadedAt,
                publicId: img.publicId,
              })),

              dialysisSessions: dialysisSessions.map(ds => ({
                sessionId: ds._id,
                status: ds.status,
                completedAt: ds.completedAt || null,
                parameters: ds.parameters || {},
                images: imagesBySession[String(ds._id)] || [],
              })),
            },
          });
        } catch (err) {
          console.error(err);
          res.status(500).json({ message: "Server error" });
        }
      }
    );




export default router;
