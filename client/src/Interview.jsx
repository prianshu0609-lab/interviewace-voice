
import { useCallback, useEffect, useRef, useState } from "react";
import { BolnaWebCall } from "@bolna/web-call";
import "./Interview.css";

const SESSION_URL = "/api/bolna-session";
const DEBUG_SDK = true;
const EXECUTION_URL = "/api/executions";

function safeStop(call, timeoutMs = 5000) {
  let timer;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  const stopping = Promise.resolve()
    .then(() => call.stop())
    .catch((err) => {
      console.warn("[Interview] call.stop() failed:", err);
    });

  return Promise.race([stopping, timeout]).finally(() =>
    clearTimeout(timer)
  );
}

function readRunId(call) {
  try {
    return call.getRunId() || null;
  } catch {
    return null;
  }
}

function captureRunId(session, moment) {
  const runId = readRunId(session.call);

  if (runId) {
    if (session.runId !== runId) {
      session.runId = runId;
      console.log(`[Interview] Bolna Run ID (${moment}):`, runId);
    }
  } else {
    console.log(`[Interview] Run ID not available yet (${moment}).`);
  }
}

function describeError(errLike) {
  const name = errLike?.name;
  const message = errLike?.message;
  const code = errLike?.code;

  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    (message && /permission|denied|microphone/i.test(message))
  ) {
    return "Microphone access was blocked. Allow microphone access in your browser, then try again.";
  }

  if (name === "NotFoundError") {
    return "No microphone was found. Connect one and try again.";
  }

  if (message) {
    return `${code || "Voice error"}: ${message}`;
  }

  return "Could not start the voice interview.";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function Interview() {
  const [voiceStatus, setVoiceStatus] = useState("Ready to begin");
  const [voiceError, setVoiceError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const sessionRef = useRef(null);

  // Fetching the execution also saves it through the existing backend route.
  const saveInterviewRecord = useCallback(async (record) => {
    if (!record.runId) {
      return {
        saved: false,
        message:
          "The call ID was unavailable, so we couldn't save this interview.",
      };
    }

    const endpoint = `${EXECUTION_URL}/${encodeURIComponent(record.runId)}`;
    let lastMessage = "Bolna is still processing your interview.";

    try {
      // Retry while Bolna finalizes the call and transcript.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await fetch(endpoint, {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message || `Server responded with ${response.status}.`
          );
        }

        if (data.storage?.saved) {
          if (data.finished) {
            return {
              saved: true,
              message: data.ready
                ? "Interview saved successfully to your history."
                : "Interview saved to your history. Some interview data may be incomplete.",
            };
          }

          lastMessage =
            "Interview record saved. Bolna is still processing the final transcript.";
        } else if (data.storage?.message) {
          lastMessage = data.storage.message;
        }

        if (data.finished) {
          return {
            saved: Boolean(data.storage?.saved),
            message:
              data.storage?.message ||
              data.message ||
              "Bolna finished processing, but the interview could not be saved.",
          };
        }

        if (attempt < 7) {
          await wait(3000);
        }
      }

      return {
        saved: false,
        message: lastMessage.includes("saved")
          ? lastMessage
          : "Bolna is taking longer than expected. Please check History again shortly.",
      };
    } catch (err) {
      console.error("[Interview] Saving interview failed:", err);

      return {
        saved: false,
        message:
          err.message ||
          "We couldn't confirm that the interview was saved. Please check the server.",
      };
    }
  }, []);

  // Complete a call once, even if multiple SDK events arrive.
  const finishSession = useCallback(
    (session, outcome) => {
      if (session.finished) return;

      session.finished = true;
      clearTimeout(session.endTimer);

      if (sessionRef.current === session) {
        sessionRef.current = null;
      }

      captureRunId(session, "call end");

      setIsStopping(false);
      setIsConnecting(false);
      setIsInCall(false);

      if (session.stopRequested && !session.wasActive) {
        setVoiceError("");
        setVoiceStatus("Connection cancelled");
        return;
      }

      if (outcome.state === "failed") {
        setVoiceStatus("Connection failed");
        setVoiceError(
          outcome.message || "The call failed. Please try again."
        );
        return;
      }

      if (!session.wasActive) {
        setVoiceStatus("Connection failed");
        setVoiceError(
          "The call ended before the interview could start. Please try again."
        );
        return;
      }

      setVoiceError("");

      const endText = outcome.reason
        ? `Interview ended: ${outcome.reason}`
        : "Interview ended";

      setVoiceStatus(`${endText}. Saving interview...`);

      // Keep the session object available to the async callback.
      saveInterviewRecord({
        runId: session.runId,
        status: "ended",
        endReason: outcome.reason || "unknown",
        startedAt: session.startedAt,
        endedAt: new Date().toISOString(),
      }).then((result) => {
        setVoiceStatus(`${endText}. ${result.message}`);

        if (!result.saved) {
          setVoiceError(
            "Your interview may not be in History yet. Please check the server and try opening History again."
          );
        }
      });
    },
    [saveInterviewRecord]
  );

  const startVoiceInterview = useCallback(async () => {
    if (sessionRef.current) return;

    setVoiceError("");
    setVoiceStatus("Connecting to your AI interviewer...");
    setIsConnecting(true);
    setIsInCall(false);
    setIsStopping(false);

    let call;

    try {
      call = new BolnaWebCall({
        sessionUrl: SESSION_URL,
        debug: DEBUG_SDK,
      });
    } catch (err) {
      console.error("[Interview] Could not create the call:", err);
      setVoiceStatus("Connection failed");
      setVoiceError(describeError(err));
      setIsConnecting(false);
      return;
    }

    const session = {
      call,
      finished: false,
      stopRequested: false,
      wasActive: false,
      runId: null,
      startedAt: null,
      endTimer: null,
    };

    sessionRef.current = session;

    call.on("state-change", (state) => {
      if (session.finished || typeof state !== "string") return;

      console.log("[Interview] State:", state);

      if (state === "connecting") {
        if (!session.wasActive) {
          setVoiceStatus("Connecting to your AI interviewer...");
        }
      } else if (state === "ringing") {
        if (!session.wasActive) {
          setVoiceStatus(
            "Ringing... your interviewer will join in a moment."
          );
        }
      } else if (state === "active") {
        session.wasActive = true;
        session.startedAt =
          session.startedAt || new Date().toISOString();

        captureRunId(session, "state active");

        setVoiceStatus("Interview in progress — speak naturally!");
        setIsConnecting(false);
        setIsInCall(true);
      } else if (state === "ended" && !session.endTimer) {
        session.endTimer = setTimeout(() => {
          finishSession(session, {
            state: "ended",
            reason: session.stopRequested ? "user-ended" : "",
          });
        }, 1000);
      }
    });

    call.on("call-start", () => {
      if (session.finished) return;

      console.log("[Interview] Call started");

      session.wasActive = true;
      session.startedAt =
        session.startedAt || new Date().toISOString();

      captureRunId(session, "call-start");

      setVoiceStatus("Interview in progress — speak naturally!");
      setIsConnecting(false);
      setIsInCall(true);
    });

    call.on("call-end", ({ reason } = {}) => {
      console.log("[Interview] Call ended:", reason);

      finishSession(session, {
        state: "ended",
        reason: reason || (session.stopRequested ? "user-ended" : ""),
      });
    });

    call.on("error", (payload) => {
      if (session.finished) return;

      console.error(
        "[Interview] SDK error:",
        payload?.code,
        payload?.message
      );

      finishSession(session, {
        state: "failed",
        reason: "error",
        message: describeError(payload),
      });

      safeStop(call);
    });

    try {
      await call.start();

      if (session.finished) {
        if (session.stopRequested) safeStop(call);
        return;
      }

      captureRunId(session, "after start()");
    } catch (err) {
      if (session.finished) return;

      console.error("[Interview] call.start() failed:", err);

      finishSession(session, {
        state: "failed",
        reason: "start-failed",
        message: describeError(err),
      });

      safeStop(call);
    }
  }, [finishSession]);

  const endVoiceInterview = useCallback(async () => {
    const session = sessionRef.current;

    if (!session) {
      setVoiceStatus("No active interview");
      return;
    }

    if (session.finished || session.stopRequested) return;

    session.stopRequested = true;
    setVoiceError("");
    setIsStopping(true);
    setVoiceStatus("Ending interview...");

    await safeStop(session.call);

    finishSession(session, {
      state: "ended",
      reason: "user-ended",
    });
  }, [finishSession]);

  const goHome = useCallback(async () => {
    await endVoiceInterview();
    window.location.href = "/";
  }, [endVoiceInterview]);

  useEffect(() => {
    return () => {
      const session = sessionRef.current;

      if (session && !session.finished) {
        session.finished = true;
        session.stopRequested = true;
        clearTimeout(session.endTimer);
        sessionRef.current = null;
        safeStop(session.call);
      }
    };
  }, []);

  return (
    <main className="interview-page">
      <header className="interview-header">
        <h2>InterviewAce</h2>
        <span>AI Interview Coach</span>
      </header>

      <section className="interview-card">
        <div className="ai-avatar">AI</div>

        <p className="interview-label">YOUR MOCK INTERVIEW</p>

        <h1>Let's begin your interview.</h1>

        <p className="interview-description">
          Your AI interviewer will help you practise explaining your
          approach to data structures and algorithms.
        </p>

        <div className="interview-status" role="status" aria-live="polite">
          <span className="status-dot"></span>
          {voiceStatus}
        </div>

        {voiceError && (
          <p className="voice-error" role="alert">
            {voiceError}
          </p>
        )}

        {!isInCall ? (
          <button
            type="button"
            className="start-button"
            onClick={startVoiceInterview}
            disabled={isConnecting || isStopping}
          >
            {isConnecting ? "Connecting..." : "Start voice interview →"}
          </button>
        ) : (
          <button
            type="button"
            className="start-button"
            onClick={endVoiceInterview}
            disabled={isStopping}
          >
            {isStopping ? "Ending interview..." : "End interview"}
          </button>
        )}

        {isConnecting && (
          <button
            type="button"
            className="back-button"
            onClick={endVoiceInterview}
            disabled={isStopping}
          >
            Cancel connection
          </button>
        )}

        <button
          type="button"
          className="back-button"
          onClick={goHome}
        >
          ← Back to home
        </button>
      </section>
    </main>
  );
} 