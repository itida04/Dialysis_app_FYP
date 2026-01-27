import mongoose from "mongoose";

const LabEntrySchema = new mongoose.Schema({
  value: Number,
  date: Date,
});

const DwellSchema = new mongoose.Schema({
  dwellTiming: String,
  solutionStrength: String,
  fillVolume: Number,
  dwellDurationHours: Number,
  numberOfExchanges: Number,
  icodextrinUsed: Boolean,
});

const BaselineAssessmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

  // MENU 2
  primaryDiagnosis: String,
  nativeKidneyDisease: String,

  // MENU 3
  dialysisType: { type: String, enum: ["HD", "PD"] },
  pdCatheterInsertionDate: Date,
  catheterTechnique: String,
  pdStartDate: Date,
  trainingStartDate: Date,
  trainingCompletionDate: Date,
  periImplantComplications: {
    present: Boolean,
    details: String,
  },

  // MENU 4
  clinicalExam: {
    pulse: Number,
    bpSystolic: Number,
    bpDiastolic: Number,
    weightKg: Number,
    heightCm: Number,
    pallor: Boolean,
    icterus: Boolean,
    cyanosis: Boolean,
    clubbing: Boolean,
    edema: Boolean,
  },

  // MENU 5
  pdPrescription: [DwellSchema],

  // MENU 6
  labs: {
    hemoglobin: LabEntrySchema,
    urea: LabEntrySchema,
    creatinine: LabEntrySchema,
    sodium: LabEntrySchema,
    potassium: LabEntrySchema,
    albumin: LabEntrySchema,
    ktv: LabEntrySchema,
  },

  // MENU 7
  planAndAdvice: {
    advisedPrescription: String,
    medications: String,
    followUpInstructions: String,
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
});

export default mongoose.model("BaselineAssessment", BaselineAssessmentSchema);
