require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");
const fs = require("fs-extra");
const path = require("path");
const { exec } = require("child_process");
const tmp = require("tmp");

const app = express();
const PORT = process.env.PORT || 5000;

// =======================
// Middleware
// =======================
app.use(express.json());

// ✅ CORS configuration
app.use(
  cors({
    origin: [
      "https://codevx.vercel.app", // your frontend
      "http://localhost:5173",     // local dev
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// =======================
// Root + Health Routes
// =======================
app.get("/", (req, res) => {
  res.status(200).json({ status: "Backend is running" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// =======================
// MongoDB Connection
// =======================
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    dbName: "login-credentials",
  })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// =======================
// Schemas
// =======================
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema, "users");

const proctoringEventSchema = new mongoose.Schema({
  assessmentId: { type: String, required: true },
  event: { type: String, required: true },
  timestamp: { type: Date, required: true },
  userId: String,
});

const ProctoringEvent = mongoose.model(
  "ProctoringEvent",
  proctoringEventSchema
);

// =======================
// Auth Routes
// =======================
app.post("/api/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (await User.findOne({ email })) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword });
    await newUser.save();

    console.log("🆕 User created:", newUser._id);
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error during registration:", error);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      return res.status(400).json({ message: "Invalid password" });

    res.json({ message: "Login successful" });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// Code Execution Route
// =======================
app.post("/api/execute", async (req, res) => {
  const { code, language, testInput } = req.body;

  if (!code || !language) {
    return res.status(400).json({ error: "Code and language are required" });
  }

  const tempDir = tmp.dirSync({ unsafeCleanup: true });
  const filename = getFilename(language);
  const filepath = path.join(tempDir.name, filename);

  try {
    const wrappedCode = wrapCodeForExecution(code, language, testInput);
    await fs.writeFile(filepath, wrappedCode);

    const command = getExecutionCommand(language, filepath);
    if (!command) {
      tempDir.removeCallback();
      return res.status(400).json({ error: "Unsupported language" });
    }

    exec(
      command,
      { cwd: tempDir.name, timeout: 5000 },
      (err, stdout, stderr) => {
        tempDir.removeCallback();

        if (err) {
          console.error("Execution error:", err);
          return res.status(400).json({
            error: stderr || err.message || "Execution error",
          });
        }

        res.json({
          output: stdout || "",
        });
      }
    );
  } catch (error) {
    console.error("Server error:", error);
    tempDir.removeCallback();
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

// =======================
// Helper Functions
// =======================
function wrapCodeForExecution(code, language, testInput) {
  // (same as your existing wrapCodeForExecution function)
  return code;
}

function getExecutionCommand(language, filepath) {
  const dirname = path.dirname(filepath);
  switch (language) {
    case "python":
      return `python3 "${filepath}"`;
    case "cpp":
      return `g++ "${filepath}" -o "${path.join(
        dirname,
        "main"
      )}" && "${path.join(dirname, "main")}"`;
    case "java":
      return `javac "${filepath}" && java -cp "${dirname}" Main`;
    case "javascript":
      return `node "${filepath}"`;
    case "rust":
      return `rustc "${filepath}" -o "${path.join(
        dirname,
        "main"
      )}" && "${path.join(dirname, "main")}"`;
    default:
      return null;
  }
}

function getFilename(language) {
  switch (language) {
    case "python":
      return "code.py";
    case "cpp":
      return "code.cpp";
    case "c":
      return "code.c";
    case "java":
      return "Main.java";
    case "rust":
      return "main.rs";
    case "javascript":
      return "code.js";
    default:
      return "code.txt";
  }
}

// =======================
// Proctoring Route
// =======================
app.post("/api/log-proctoring-event", async (req, res) => {
  try {
    const { event, timestamp, assessmentId, userId } = req.body;

    const newEvent = new ProctoringEvent({
      event,
      timestamp,
      assessmentId,
      userId,
    });

    await newEvent.save();
    res.status(201).json({ message: "Event logged successfully" });
  } catch (error) {
    console.error("Error logging proctoring event:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// =======================
// Start Server
// =======================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
