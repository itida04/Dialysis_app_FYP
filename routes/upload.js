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
import MedicalProfile from "../models/MedicalProfile.js";
import BaselineAssessment from "../models/BaselineAssessment.js";
import FollowUpAssessment from "../models/FollowUpAssessment.js";
import Event from "../models/Event.js";

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

        // 🔹 PD-specific materials (quantities)
        const {
          sessionsCount = 0,
          pdMaterials = {},
          notes = "",
        } = req.body;
        

        const session = new Session({
          patientId,
          doctorId,
          type: "material",
          status: "active",
          notes,
          materials: {
            sessionsCount: Number(sessionsCount) || 0,
            pdMaterials,
          },
        });

        await session.save();

        res.json({ success: true, session });
      } catch (err) {
        console.error("Error creating material session:", err);
        res.status(500).json({
          message: "Error creating material session",
          error: err.message,
        });
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

      // 2️⃣ Count USED sessions (completed + verified ONLY)
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

      // 3️⃣ Create dialysis session (no blocking, no day logic)
      const session = new Session({
        patientId,
        doctorId,
        type: "dialysis",
        status: "active",
        materialSessionId,

      });

      await session.save();

      res.json({
        success: true,
        message: "Dialysis session started",
        session,
      });
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
        const { sessionId, symptoms } = req.body;

        if (!sessionId) {
          return res.status(400).json({ message: "sessionId is required" });
        }

        const session = await Session.findOne({
          _id: sessionId,
          patientId: req.user.id,
          type: "dialysis",
        });

        if (!session) {
          return res.status(404).json({
            message: "Session not found or unauthorized",
          });
        }

        if (session.status !== "active") {
          return res.status(400).json({
            message: "Dialysis session already completed or verified",
          });
        }
        
        session.status = "completed";
        session.completedAt = new Date();


        session.parameters = {
            voluntary: {
              wellbeing: Number(symptoms?.wellbeing) || null,

              appetite: Boolean(symptoms?.appetite),
              nausea: Boolean(symptoms?.nausea),
              vomiting: Boolean(symptoms?.vomiting),
              abdominalDiscomfort: Boolean(symptoms?.abdominalDiscomfort),
              constipation: Boolean(symptoms?.constipation),
              diarrhea: Boolean(symptoms?.diarrhea),

              sleepQuality: Number(symptoms?.sleepQuality) || null,
              fatigue: Boolean(symptoms?.fatigue),
              ableToDoActivities: Boolean(symptoms?.ableToDoActivities),

              breathlessness: Boolean(symptoms?.breathlessness),
              footSwelling: Boolean(symptoms?.footSwelling),
              facialPuffiness: Boolean(symptoms?.facialPuffiness),
              rapidWeightGain: Boolean(symptoms?.rapidWeightGain),

              bpMeasured: Boolean(symptoms?.bpMeasured),
              sbp: symptoms?.sbp != null ? Number(symptoms.sbp) : null,
              dbp: symptoms?.dbp != null ? Number(symptoms.dbp) : null,

              weightMeasured: Boolean(symptoms?.weightMeasured),
              weightKg: symptoms?.weightKg != null ? Number(symptoms.weightKg) : null,

              painDuringFillDrain: Boolean(symptoms?.painDuringFillDrain),
              slowDrain: Boolean(symptoms?.slowDrain),
              catheterLeak: Boolean(symptoms?.catheterLeak),
              exitSiteIssue: Boolean(symptoms?.exitSiteIssue),
              effluentClarity: symptoms?.effluentClarity || null,

              urinePassed: Boolean(symptoms?.urinePassed),
              urineAmount: symptoms?.urineAmount || null,
              fluidOverloadFeeling: Boolean(symptoms?.fluidOverloadFeeling),

              fever: Boolean(symptoms?.fever),
              chills: Boolean(symptoms?.chills),
              newAbdominalPain: Boolean(symptoms?.newAbdominalPain),
              suddenUnwell: Boolean(symptoms?.suddenUnwell),

              comments: symptoms?.comments || "",
            },
          };


        await session.save();

        res.json({
          success: true,
          message: "Dialysis session completed with symptom checklist",
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

/**
 * POST /doctor/dialysis-sessions-by-date
 *
 * Auth: doctor
 * Body: { patientId, date }  // date = YYYY-MM-DD
 *
 * → Returns all dialysis sessions done by patient on that date
 */
  router.post(
    "/doctor/dialysis-sessions-by-date",
    authMiddleware(["doctor"]),
    async (req, res) => {
      try {
        const doctorId = req.user.id;
        const { patientId, date } = req.body;

        if (!patientId || !date) {
          return res.status(400).json({
            message: "patientId and date are required (YYYY-MM-DD)",
          });
        }

        // 1️⃣ Validate patient belongs to doctor
        const patient = await User.findOne({
          _id: patientId,
          doctorId,
          role: "patient",
        });

        if (!patient) {
          return res.status(403).json({
            message: "Unauthorized or patient not found under this doctor",
          });
        }

        // 2️⃣ Build date range (start → end of day)
        const startDate = new Date(`${date}T00:00:00.000Z`);
        const endDate = new Date(`${date}T23:59:59.999Z`);

        // 3️⃣ Fetch dialysis sessions for that date
        const dialysisSessions = await Session.find({
          type: "dialysis",
          patientId,
          doctorId,
          status: { $in: ["completed", "verified"] },
          completedAt: { $gte: startDate, $lte: endDate },
        }).sort({ completedAt: 1 });

        // 4️⃣ Fetch images for these sessions
        const sessionIds = dialysisSessions.map(ds => ds._id);

        const images = await Image.find({
          sessionId: { $in: sessionIds },
          uploadedBy: "patient",
        }).sort({ uploadedAt: 1 });

        // Group images by sessionId
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

        // 5️⃣ Build response
        const sessions = dialysisSessions.map(ds => ({
          sessionId: ds._id,
          materialSessionId: ds.materialSessionId,
          status: ds.status,
          startedAt: ds.createdAt,
          completedAt: ds.completedAt,
          parameters: ds.parameters || {},
          images: imagesBySession[String(ds._id)] || [],
        }));

        res.json({
          success: true,
          doctorId,
          patient: {
            id: patient._id,
            name: patient.name,
            email: patient.email,
          },
          date,
          totalSessions: sessions.length,
          sessions,
        });
      } catch (err) {
        console.error("Error fetching sessions by date:", err);
        res.status(500).json({ message: "Server error" });
      }
    }
  );



/**
 * PATCH /doctor/medical-profile
 * Auth: doctor
 * Body: { patientId, ...medicalProfileFields }
 */
  router.patch(
    "/doctor/medical-profile",
    authMiddleware(["doctor"]),
    async (req, res) => {
      try {
        const doctorId = req.user.id;
        const { patientId, ...medicalData } = req.body;

        if (!patientId) {
          return res.status(400).json({ message: "patientId is required" });
        }

        // Ensure patient belongs to this doctor
        const patient = await User.findOne({
          _id: patientId,
          doctorId,
          role: "patient",
        });

        if (!patient) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        const profile = await MedicalProfile.findOneAndUpdate(
          { patientId },
          {
            patientId,
            doctorId,
            ...medicalData,
          },
          {
            new: true,
            upsert: true, // creates if not exists
          }
        );

        res.json({
          success: true,
          message: "Medical profile saved successfully",
          profile,
        });
      } catch (err) {
        console.error("Medical profile update error:", err);
        res.status(500).json({ message: "Server error" });
      }
    }
  );

/**
 * POST /medical-profile
 * Auth: doctor | patient
 * Doctor body: { patientId }
 * Patient body: {}
 */
router.post(
  "/medical-profile",
  authMiddleware(["doctor", "patient"]),
  async (req, res) => {
    try {
      let patientId;

      if (req.user.role === "doctor") {
        patientId = req.body.patientId;
        if (!patientId) {
          return res.status(400).json({ message: "patientId is required" });
        }

        const patient = await User.findOne({
          _id: patientId,
          doctorId: req.user.id,
          role: "patient",
        });

        if (!patient) {
          return res.status(403).json({ message: "Unauthorized" });
        }
      } else {
        patientId = req.user.id;
      }

      const profile = await MedicalProfile.findOne({ patientId });

      if (!profile) {
        return res.json({
          success: true,
          profile: null,
          message: "Medical profile not created yet",
        });
      }

      res.json({ success: true, profile });
    } catch (err) {
      console.error("Fetch medical profile error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * PATCH /doctor/baseline-assessment
 * Auth: doctor
 */
  router.patch(
    "/doctor/baseline-assessment",
    authMiddleware(["doctor"]),
    async (req, res) => {
      try {
        const doctorId = req.user.id;
        const { patientId, ...data } = req.body;

        if (!patientId) {
          return res.status(400).json({ message: "patientId is required" });
        }

        const patient = await User.findOne({
          _id: patientId,
          doctorId,
          role: "patient",
        });

        if (!patient) {
          return res.status(403).json({ message: "Unauthorized" });
        }

        const assessment = await BaselineAssessment.findOneAndUpdate(
          { patientId },
          {
            patientId,
            doctorId,
            ...data,
            updatedAt: new Date(),
          },
          { upsert: true, new: true }
        );

        res.json({ success: true, assessment });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    }
  );


/**
 * POST /baseline-assessment
 * Auth: doctor | patient
 */
  router.post(
    "/baseline-assessment",
    authMiddleware(["doctor", "patient"]),
    async (req, res) => {
      let patientId;

      if (req.user.role === "doctor") {
      patientId = req.body.patientId;

      const patient = await User.findOne({
        _id: patientId,
        doctorId: req.user.id,
        role: "patient",
      });

      if (!patient) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      } else {
        patientId = req.user.id;
      }

      const assessment = await BaselineAssessment.findOne({ patientId });
      res.json({ success: true, assessment });
    }
  );

  

/**
 * PATCH /doctor/followup-assessment
 * Auth: doctor
 */
router.patch(
  "/doctor/followup-assessment",
  authMiddleware(["doctor"]),
  async (req, res) => {
    try {
      const doctorId = req.user.id;
      const { patientId, visitDate, ...data } = req.body;

      if (!patientId) {
        return res.status(400).json({ message: "patientId is required" });
      }

      const patient = await User.findOne({
        _id: patientId,
        doctorId,
        role: "patient",
      });

      if (!patient) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const assessment = await FollowUpAssessment.findOneAndUpdate(
        { patientId, visitDate: visitDate || new Date() },
        {
          patientId,
          doctorId,
          visitDate: visitDate || new Date(),
          ...data,
        },
        { upsert: true, new: true }
      );

      res.json({ success: true, assessment });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /followup-assessments
 * Auth: doctor | patient
 */
  router.post(
    "/followup-assessments",
    authMiddleware(["doctor", "patient"]),
    async (req, res) => {
      let patientId;

      if (req.user.role === "doctor") {
        patientId = req.body.patientId;
        if (!patientId) {
          return res.status(400).json({ message: "patientId required" });
        }
      } else {
        patientId = req.user.id;
      }

      const assessments = await FollowUpAssessment.find({ patientId })
        .sort({ visitDate: -1 });

      res.json({
        success: true,
        count: assessments.length,
        assessments,
      });
    }
  );


/**
 * POST /events
 * Auth: doctor | patient
 * CREATE EVENT (Doctor / Patient)
 */
router.post(
  "/events",
  authMiddleware(["doctor", "patient"]),
  async (req, res) => {
    try {
      const {
        patientId,
        eventType,
        description,
        severity,
        eventDate,
        relatedSessionId,
      } = req.body;

      const creatorRole = req.user.role;

      let finalPatientId = patientId;

      if (creatorRole === "patient") {
        finalPatientId = req.user.id;
      }

      if (!finalPatientId || !eventType || !eventDate) {
        return res.status(400).json({
          message: "patientId, eventType, and eventDate are required",
        });
      }

      const patient = await User.findById(finalPatientId);
      if (!patient) {
        return res.status(404).json({ message: "Patient not found" });
      }

      const event = new Event({
        patientId: finalPatientId,
        doctorId: patient.doctorId,
        eventType,
        description,
        severity,
        eventDate,
        relatedSessionId: relatedSessionId || null,
        createdByRole: creatorRole,
      });

      await event.save();

      res.json({ success: true, event });
    } catch (err) {
      console.error("Create event error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /events/list
 * Auth: doctor | patient
 * get Events List(DOCTOR/PATIENT)
 */
router.post(
  "/events/list",
  authMiddleware(["doctor", "patient"]),
  async (req, res) => {
    try {
      let patientId;

      if (req.user.role === "doctor") {
        patientId = req.body.patientId;
        if (!patientId) {
          return res.status(400).json({ message: "patientId is required" });
        }
      } else {
        patientId = req.user.id;
      }

      const events = await Event.find({ patientId }).sort({ eventDate: -1 });

      res.json({
        success: true,
        count: events.length,
        events,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * PATCH /events/resolve
 * Auth: doctor
 * RESOLVE EVENT (ONLY DOC)
 */
router.patch(
  "/events/resolve",
  authMiddleware(["doctor"]),
  async (req, res) => {
    try {
      const { eventId, resolutionNotes } = req.body;

      if (!eventId) {
        return res.status(400).json({ message: "eventId is required" });
      }

      const event = await Event.findById(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      event.resolved = true;
      event.resolutionNotes = resolutionNotes || "";
      await event.save();

      res.json({ success: true, event });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  }
);


/**
 * POST /analytics/patient-summary
 * Auth: doctor
 */
router.post(
  "/analytics/patient-summary",
  authMiddleware(["doctor"]),
  async (req, res) => {
    try {
      const { patientId } = req.body;
      const doctorId = req.user.id;

      if (!patientId) {
        return res.status(400).json({ message: "patientId required" });
      }

      const patient = await User.findOne({
        _id: patientId,
        doctorId,
        role: "patient",
      });

      if (!patient) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const totalDialysisSessions = await Session.countDocuments({
        patientId,
        type: "dialysis",
        status: { $in: ["completed", "verified"] },
      });

      const totalEvents = await Event.countDocuments({ patientId });

      const peritonitisCount = await Event.countDocuments({
        patientId,
        eventType: "peritonitis",
      });

      res.json({
        success: true,
        patient: {
          id: patient._id,
          name: patient.name,
        },
        analytics: {
          totalDialysisSessions,
          totalEvents,
          peritonitisCount,
        },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Server error" });
    }
  }
);


export default router;
