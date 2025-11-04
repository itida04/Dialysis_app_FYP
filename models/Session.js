// models/Session.js
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: {
    type: String,
    enum: ["material", "dialysis"], // doctor-created or patient-created
    required: true
  },
  status: {
    type: String,
    enum: ["active", "completed", "reviewed"],
    default: "active"
  },
  notes: {
    type: String,
    default: ""
  },
  parameters: {
    // optional - for dialysis sessions (BP, weight, etc.)
    type: Object,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
//   verifiedAt: { type: Date },
//   verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
});

export default mongoose.model("Session", sessionSchema);
