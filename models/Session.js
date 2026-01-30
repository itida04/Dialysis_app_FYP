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
  // parameters: {
  //   type: Object,
  //   default: {},
  // },

  parameters: {
    voluntary: {
      wellbeing: { type: Number, min: 1, max: 10 },

      appetite: { type: Boolean },
      nausea: { type: Boolean },
      vomiting: { type: Boolean },
      abdominalDiscomfort: { type: Boolean },
      constipation: { type: Boolean },
      diarrhea: { type: Boolean },

      sleepQuality: { type: Number, min: 1, max: 10 },
      fatigue: { type: Boolean },
      ableToDoActivities: { type: Boolean },

      breathlessness: { type: Boolean },
      footSwelling: { type: Boolean },
      facialPuffiness: { type: Boolean },
      rapidWeightGain: { type: Boolean },

      bpMeasured: { type: Boolean },
      sbp: { type: Number },
      dbp: { type: Number },

      weightMeasured: { type: Boolean },
      weightKg: { type: Number },

      painDuringFillDrain: { type: Boolean },
      slowDrain: { type: Boolean },
      catheterLeak: { type: Boolean },
      exitSiteIssue: { type: Boolean },
      effluentClarity: {
        type: String,
        enum: ["clear", "cloudy", "bloody", "unknown"],
      },

      urinePassed: { type: Boolean },
      urineAmount: {
        type: String,
        enum: ["none", "less", "normal", "increased"],
      },
      fluidOverloadFeeling: { type: Boolean },

      fever: { type: Boolean },
      chills: { type: Boolean },
      newAbdominalPain: { type: Boolean },
      suddenUnwell: { type: Boolean },

      comments: { type: String, default: "" },
    },
  },



  materials: {
    // For how many dialysis sessions this supply is intended
    sessionsCount: {

      type: Number,
      default: 0,
    },

    // PD Consumables (Quantities)
    pdMaterials: {
      transferSet: {
        type: Number, // Max 2
        default: 0,
      },

      capd: {
        fluid1_5_2L: { type: Number, default: 0 },
        fluid2_5_2L: { type: Number, default: 0 },
        fluid4_25_2L: { type: Number, default: 0 },

        fluid1_5_1L: { type: Number, default: 0 },
        fluid2_5_1L: { type: Number, default: 0 },
        fluid4_25_1L: { type: Number, default: 0 },
      },

      apd: {
        fluid1_7_1L: { type: Number, default: 0 },
      },

      icodextrin2L: {
        type: Number,
        default: 0,
      },

      minicap: {
        type: Number,
        default: 0,
      },

      others: {
        description: String,
        quantity: Number,
      },
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
