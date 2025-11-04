import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["doctor", "patient"], required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // for patients
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("User", UserSchema);
