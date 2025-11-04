// models/Image.js
import mongoose from "mongoose";

const imageSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session",
    required: true
  },
  uploadedBy: {
    type: String,
    enum: ["doctor", "patient"],
    required: true
  },
  uploaderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  publicId: {
    type: String,
    required: true
  },
  type: {
    // optional: you can tag it if needed later ("proof", "dialysis-step", etc.)
    type: String,
    default: "general"
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("Image", imageSchema);
