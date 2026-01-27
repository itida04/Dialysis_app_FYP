import mongoose from "mongoose";

const DwellSchema = new mongoose.Schema({
  dwellTiming: String,
  solutionStrength: String,
  fillVolume: Number,
  dwellDurationHours: Number,
  numberOfExchanges: Number,
  icodextrinUsed: Boolean,
});

const FollowUpAssessmentSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  visitDate: {
    type: Date,
    default: Date.now,
  },

  // MENU 2: PD Status
  dialysisType: { type: String, enum: ["HD", "PD"] },
  pdPerformedBy: { type: String, enum: ["Self", "Caregiver", "Nurse"] },
  lastTrainingDate: Date,

  // MENU 3: WELL-BEING & SYMPTOMS
  wellbeing: {
    overall: Number, // Likert 1–5
    appetite: String,
    sleepQuality: Number, // 0–10
    fatigueLevel: Number, // 0–10
    weightTrend: String,
  },

  symptoms: {
    nausea: Boolean,
    pruritus: Boolean,
    breathlessness: Boolean,
    restlessLegs: Boolean,
    poorConcentration: Boolean,
    drainPain: Boolean,
    slowDrain: Boolean,
    cloudyEffluent: Boolean,
    recentHospitalization: {
      present: Boolean,
      details: String,
    },
  },

  // MENU 4: Examination
  examination: {
    bpSystolic: Number,
    bpDiastolic: Number,
    weightKg: Number,
    heightCm: Number,
    edema: Boolean,
    crepitations: Boolean,
  },

  // MENU 5: CURRENT PD PRESCRIPTION
  currentPdPrescription: [DwellSchema],

  // MENU 6: PD ADEQUACY
  adequacy: {
    bpControlled: Boolean,
    urineOutput24h: Number,
    bmi: Number,
    muscleLoss: Boolean,
    albumin: Number,
    phosphate: Number,
    potassium: Number,
    bicarbonate: Number,
    weeklyKtv: Number,
    residualCrCl: Number,
    underdialysisSymptoms: String,
  },

  // MENU 7: EVENTS & COMPLICATIONS
  events: {
    peritonitisEpisodes: Number,
    exitSiteInfection: Boolean,
    techniqueIssues: Boolean,
    hospitalizations: Boolean,
    details: String,
  },

  // MENU 8: PLAN & FOLLOW-UP
  plan: {
    prescriptionChangeNeeded: Boolean,
    revisedPrescription: String,
    medications: String,
    followUpAdvice: String,
    nextReviewDate: Date,
  },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("FollowUpAssessment", FollowUpAssessmentSchema);
