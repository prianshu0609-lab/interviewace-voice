
const mongoose = require("mongoose");

const interviewSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    agentId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      default: "unknown",
    },
    transcript: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    summary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    feedback: {
      type: String,
      default: null,
    },
    duration: {
      type: Number,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    extractedData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true, 
  }
);

module.exports = mongoose.model("Interview", interviewSchema); 