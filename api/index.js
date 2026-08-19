const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// MongoDB Connection Caching for Vercel
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is missing.");
  }
  const db = await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  cachedDb = db;
  return db;
}

// Middleware to ensure database connection
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    next(err);
  }
});

// Schemas
const memberSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 }
  },
  { timestamps: true }
);

const shareSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
    url: { type: String, required: true, trim: true, maxlength: 500 },
    type: { type: String, enum: ["video", "short", "channel"], required: true },
    title: { type: String, default: "YouTube Content", maxlength: 180 },
    thumbnail: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

memberSchema.index({ createdAt: -1 });
shareSchema.index({ createdAt: -1 });
shareSchema.index({ memberId: 1, createdAt: -1 });

// Avoid compiling models multiple times in serverless environments
const Member = mongoose.models.Member || mongoose.model("Member", memberSchema);
const Share = mongoose.models.Share || mongoose.model("Share", shareSchema);

function detectYouTubeType(rawUrl) {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (!["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      return "invalid";
    }

    if (host === "youtu.be") return "video";

    if (parsed.pathname.startsWith("/shorts/")) return "short";
    if (parsed.pathname.startsWith("/watch") && parsed.searchParams.get("v")) return "video";
    if (parsed.pathname.startsWith("/@") || parsed.pathname.startsWith("/channel/") || parsed.pathname.startsWith("/c/") || parsed.pathname.startsWith("/user/")) {
      return "channel";
    }

    return "invalid";
  } catch {
    return "invalid";
  }
}

function getYouTubeId(url, type) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (type === "video") {
      if (host === "youtu.be") return parsed.pathname.slice(1).split("/")[0];
      return parsed.searchParams.get("v");
    }
    if (type === "short") return parsed.pathname.split("/")[2] || null;
  } catch { }
  return null;
}

function getThumbnail(url, type) {
  const id = getYouTubeId(url, type);
  if ((type === "video" || type === "short") && id) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  }
  return "";
}

function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.get("/api/settings", (req, res) => {
  res.json({
    settings: {
      channelName: "Everyday Stories",
      channelHandle: "@EverydayStories",
      channelUrl: "https://www.youtube.com/@everydaystories968",
      channelAvatar: ""
    }
  });
});

app.get("/api/members/count", async (req, res, next) => {
  try {
    const count = await Member.countDocuments();
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

app.post("/api/members", async (req, res, next) => {
  try {
    const name = cleanName(req.body.name);

    if (!name) {
      return res.status(400).json({ message: "Please enter your name." });
    }

    if (name.length > 40) {
      return res.status(400).json({ message: "Name must be 40 characters or less." });
    }

    const member = await Member.create({ name });
    const memberCount = await Member.countDocuments();

    res.status(201).json({ member, memberCount });
  } catch (err) {
    next(err);
  }
});

app.get("/api/members/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid member ID." });
    }
    const member = await Member.findById(req.params.id).lean();
    if (!member) return res.status(404).json({ message: "Member not found." });
    res.json({ member });
  } catch (err) {
    next(err);
  }
});

app.get("/api/shares", async (req, res, next) => {
  try {
    const shares = await Share.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("memberId", "name")
      .lean();

    res.json({
      shares: shares.map((share) => ({
        ...share,
        member: share.memberId ? { name: share.memberId.name, _id: share.memberId._id } : { name: "Community Member" }
      }))
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/shares", async (req, res, next) => {
  try {
    const { memberId, url } = req.body;

    if (!mongoose.isValidObjectId(memberId)) {
      return res.status(400).json({ message: "Invalid member." });
    }

    const member = await Member.findById(memberId);
    if (!member) {
      return res.status(404).json({ message: "Member not found. Please join again." });
    }

    const cleanUrl = String(url || "").trim();
    const type = detectYouTubeType(cleanUrl);

    if (type === "invalid") {
      return res.status(400).json({ message: "Please enter a valid YouTube video, Short, or channel link." });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayCount = await Share.countDocuments({
      memberId,
      createdAt: { $gte: startOfDay }
    });

    if (todayCount >= 5) {
      return res.status(429).json({ message: "Daily share limit reached. Come back tomorrow." });
    }

    const duplicate = await Share.findOne({ memberId, url: cleanUrl });
    if (duplicate) {
      return res.status(409).json({ message: "You already shared this link." });
    }

    const share = await Share.create({
      memberId,
      url: cleanUrl,
      type,
      title: type === "channel" ? "YouTube Channel" : type === "short" ? "YouTube Short" : "YouTube Video",
      thumbnail: getThumbnail(cleanUrl, type)
    });

    res.status(201).json({
      share: {
        ...share.toObject(),
        member: { name: member.name, _id: member._id }
      }
    });
  } catch (err) {
    next(err);
  }
});

app.delete("/api/shares/:id", async (req, res, next) => {
  try {
    const shareId = req.params.id;
    const { memberId } = req.body;

    if (!mongoose.isValidObjectId(shareId) || !mongoose.isValidObjectId(memberId)) {
      return res.status(400).json({ message: "Invalid request." });
    }

    const share = await Share.findById(shareId);
    if (!share) {
      return res.status(404).json({ message: "Share not found." });
    }

    if (share.memberId.toString() !== memberId) {
      return res.status(403).json({ message: "You can only delete your own shares." });
    }

    await Share.findByIdAndDelete(shareId);
    res.json({ message: "Share deleted successfully." });
  } catch (err) {
    next(err);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong. Please try again." });
});

module.exports = app;
