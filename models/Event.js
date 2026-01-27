import mongoose from "mongoose";

const EventSchema = new mongoose.Schema({
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

  // Core classification
  eventType: {
    type: String,
    enum: [
      "peritonitis",
      "exit_site_infection",
      "hospitalization",
      "technique_issue",
      "missed_dialysis",
      "cloudy_effluent",
      "other",
    ],
    required: true,
  },

  // Event details
  description: {
    type: String,
    default: "",
  },

  severity: {
    type: String,
    enum: ["mild", "moderate", "severe"],
    default: "moderate",
  },

  relatedSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session",
    default: null,
  },

  // Timeline
  eventDate: {
    type: Date,
    required: true,
  },

  resolved: {
    type: Boolean,
    default: false,
  },

  resolutionNotes: {
    type: String,
    default: "",
  },

  createdByRole: {
    type: String,
    enum: ["doctor", "patient", "system"],
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Event", EventSchema);
