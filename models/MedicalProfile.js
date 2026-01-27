import mongoose from "mongoose";

const medicalProfileSchema = new mongoose.Schema(
  {
    // 🔹 Ownership
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // ONE profile per patient
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // =========================
    // MENU 1: Patient Identification
    // =========================
    age: { type: Number },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
    crNumber: {
      type: String,
      unique: true,
      sparse: true, // allows null for older records
    },
    contactNumber: { type: String },
    address: { type: String },

    educationLevel: {
      type: String,
      enum: [
        "No formal education",
        "Primary",
        "Middle",
        "Secondary",
        "Higher secondary",
        "Graduate",
        "Post-graduate / Professional",
      ],
    },

    incomeLevel: {
      type: String,
      enum: ["Upper", "Upper middle", "Lower middle", "Upper lower", "Lower"],
    },

    // =========================
    // MENU 2: Diagnosis & Kidney Disease
    // =========================
    primaryDiagnosis: { type: String },

    nativeKidneyDisease: {
      type: String,
      enum: [
        "Diabetic kidney disease",
        "Hypertensive nephrosclerosis",
        "Chronic glomerulonephritis",
        "IgA nephropathy",
        "FSGS",
        "Membranous nephropathy",
        "Other GN",
        "CKD of unknown etiology",
        "Reflux nephropathy",
        "Obstructive uropathy",
        "Polycystic kidney disease",
        "Tubulointerstitial disease",
        "Congenital / hereditary",
        "Others",
      ],
    },

    // =========================
    // MENU 3: Dialysis Info (Baseline)
    // =========================
    dialysisType: {
      type: String,
      enum: ["HD", "PD"],
    },

    // =========================
    // Allergies & Safety
    // =========================
    allergies: [{ type: String }],

    emergencyContact: {
      name: String,
      phone: String,
      relation: String,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

export default mongoose.model("MedicalProfile", medicalProfileSchema);
