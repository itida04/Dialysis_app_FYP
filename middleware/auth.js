import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const authMiddleware = (roles = []) => {
  // roles: [] => any logged in user; ["doctor"] => only doctors; ["patient"] => only patients
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Missing auth header" });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Invalid auth header" });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload; // { id, email, role }
      if (roles.length && !roles.includes(payload.role)) {
        return res.status(403).json({ message: "Forbidden: insufficient role" });
      }
      next();
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  };
};
