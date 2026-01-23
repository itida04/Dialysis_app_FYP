// models/Session.js
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  type: {
    type: String,
    enum: ["material", "dialysis"], // doctor-created or patient-created
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "acknowledged", "completed", "verified"],
    default: "active",
  },
  notes: {
    type: String,
    default: "",
  },

  // 🔹 For dialysis sessions (BP, weight, etc.)
  parameters: {
    type: Object,
    default: {},
  },

  // 🔹 For material sessions (what items were issued)
  materials: {
    sessionsCount: {
      // "For how many sessions"
      type: Number,
      default: 0,
    },
    dialysisMachine: {
      // "portable" / "standard" / "none"
      type: String,
      enum: ["portable", "standard", "none"],
      default: "none",
    },
    dialyzer: {
      // Dialyzer taken or not
      type: Boolean,
      default: false,
    },
    bloodTubingSets: {
      // Blood tubing sets taken or not
      type: Boolean,
      default: false,
    },
    dialysisNeedles: {
      // Dialysis needles taken or not
      type: Boolean,
      default: false,
    },
    dialysateConcentrates: {
      // Acid & bicarbonate solutions
      type: Boolean,
      default: false,
    },
    heparin: {
      // Heparin taken or not
      type: Boolean,
      default: false,
    },
    salineSolution: {
      // 0.9% NaCl
      type: Boolean,
      default: false,
    },
  },

  // 🔹 NEW: link dialysis session → material session
  materialSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session", // refers to a material-type session
    default: null,  // only filled for type: "dialysis"
  },

  // 🔹 NEW: which day (1..N) under that material session
  // dayNumber: {
  //   type: Number,
  //   default: null,  // only filled for type: "dialysis"
  // },

  // existing createdAt
  createdAt: {
    type: Date,
    default: Date.now,
  },

  // 🔹 used in /finish-dialysis-session
  completedAt: {
    type: Date,
  },

  // ✅ patient acknowledgment timestamp for material session
  acknowledgedAt: {
    type: Date,
  },

  // if later you want verification, you can uncomment these:
  // verifiedAt: { type: Date },
  // verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }

  // 🔹 Doctor verification fields (ONLY for dialysis sessions)
  verifiedAt: {
    type: Date,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // doctor
  },
  verificationNotes: {
    type: String,
    default: "",
  },

});

export default mongoose.model("Session", sessionSchema);
