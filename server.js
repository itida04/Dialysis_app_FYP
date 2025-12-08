// import express from "express";
// import dotenv from "dotenv";
// import cors from "cors";
// import { connectDB } from "./config/db.js";
// //changess
// dotenv.config();
// connectDB();

// const app = express();
// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// import authRoutes from "./routes/auth.js";
// import uploadRoutes from "./routes/upload.js";

// app.use("/api/auth", authRoutes);
// app.use("/api/upload", uploadRoutes);

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/db.js";

dotenv.config();
connectDB();

const app = express();

/**
 * ✅ CORS CONFIGURATION
 */
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://dialysis-app-fyp.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow Postman / mobile without Origin
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS not allowed"), false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ❌ remove this line that was causing the error
// app.options("*", cors());

/**
 * ✅ BODY PARSERS
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * ✅ ROUTES
 */
import authRoutes from "./routes/auth.js";
import uploadRoutes from "./routes/upload.js";

app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);

/**
 * ✅ SERVER START
 */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
