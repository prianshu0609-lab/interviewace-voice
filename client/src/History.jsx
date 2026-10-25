import { useEffect, useState } from "react";
import "./History.css";

function History() {
  const [interviews, setInterviews] = useState([]);
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const runId = new URLSearchParams(window.location.search).get("runId");

  useEffect(() => {
    if (runId) {
      setLoading(false);
      setDetailLoading(true);
      setDetailError("");
      setSelectedInterview(null);

      fetch(`/api/interviews/${encodeURIComponent(runId)}`)
        .then(async (response) => {
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || "Unable to load this interview.");
          }

          setSelectedInterview(data.interview);
        })
        .catch((err) => setDetailError(err.message))
        .finally(() => setDetailLoading(false));

      return;
    }

    setLoading(true);

    fetch("/api/interviews")
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load interview history.");
        }

        setInterviews(data.interviews || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [runId]);

  async function generateFeedback() {
    if (!selectedInterview?.runId) return;

    setFeedbackLoading(true);
    setFeedbackError("");
    setFeedbackMessage("");

    try {
      const response = await fetch(
        `/api/interviews/${encodeURIComponent(selectedInterview.runId)}/feedback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Unable to generate feedback."
        );
      }

      // The API returns feedback as a string and may indicate
      // that previously generated feedback was reused.
      if (typeof data.feedback === "string" && data.feedback.trim()) {
        setSelectedInterview((previous) => ({
          ...previous,
          feedback: data.feedback,
        }));
      } else {
        // Reload details in case the API saved feedback but returned
        // a different response shape.
        const detailResponse = await fetch(
          `/api/interviews/${encodeURIComponent(selectedInterview.runId)}`
        );
        const detailData = await detailResponse.json();

        if (!detailResponse.ok) {
          throw new Error(
            detailData.message || "Feedback was generated, but could not be loaded."
          );
        }

        setSelectedInterview(detailData.interview);
      }

      setFeedbackMessage(
        data.cached
          ? "Your previously generated feedback has been loaded."
          : "AI feedback generated successfully."
      );
    } catch (err) {
      setFeedbackError(err.message || "Something went wrong.");
    } finally {
      setFeedbackLoading(false);
    }
  }

  return (
    <main className="history-page">
      <header className="history-header">
        <a className="history-brand" href="/">
          Interview<span>Ace</span>
        </a>

        <button onClick={() => (window.location.href = "/history")}>
          All Interviews
        </button>
      </header>

      <section className="history-content">
        {runId ? (
          <>
            <p className="history-eyebrow">INTERVIEW DETAILS</p>
            <h1>Interview Review</h1>

            {detailLoading && <p>Loading interview...</p>}
            {detailError && (
              <p className="history-error">{detailError}</p>
            )}

            {selectedInterview && (
              <article className="history-card transcript-card">
                <div className="transcript-info">
                  <span
                    className={`history-status ${selectedInterview.status}`}
                  >
                    {selectedInterview.status || "Unknown"}
                  </span>

                  <p>
                    {selectedInterview.createdAt
                      ? new Date(selectedInterview.createdAt).toLocaleString()
                      : "Date unavailable"}
                  </p>

                  <p>
                    Duration:{" "}
                    {selectedInterview.duration
                      ? `${Math.floor(selectedInterview.duration / 60)}m ${
                          selectedInterview.duration % 60
                        }s`
                      : "Unavailable"}
                  </p>
                </div>

                <h2>Conversation</h2>
                <pre className="transcript-text">
                  {typeof selectedInterview.transcript === "string"
                    ? selectedInterview.transcript
                    : selectedInterview.transcript
                      ? JSON.stringify(selectedInterview.transcript, null, 2)
                      : "No transcript was saved for this interview."}
                </pre>

                {selectedInterview.summary && (
                  <>
                    <h2>Summary</h2>
                    <p className="transcript-summary">
                      {typeof selectedInterview.summary === "string"
                        ? selectedInterview.summary
                        : JSON.stringify(
                            selectedInterview.summary,
                            null,
                            2
                          )}
                    </p>
                  </>
                )}

                <div className="feedback-section">
                  <h2>AI Interview Feedback</h2>
                  <p>
                    Get detailed feedback on your technical accuracy,
                    problem-solving approach, complexity analysis, and areas
                    to improve.
                  </p>

                  {!selectedInterview.feedback && (
                    <button
                      className="history-view-button"
                      onClick={generateFeedback}
                      disabled={feedbackLoading || detailLoading}
                    >
                      {feedbackLoading
                        ? "Generating feedback..."
                        : "Generate AI Feedback"}
                    </button>
                  )}

                  {feedbackError && (
                    <p className="history-error">{feedbackError}</p>
                  )}

                  {feedbackMessage && (
                    <p role="status">{feedbackMessage}</p>
                  )}

                  {selectedInterview.feedback && (
                    <div className="feedback-content">
                      {selectedInterview.feedback
                        .split(/\r?\n/)
                        .map((line, index) => {
                          const trimmed = line.trim();

                          if (!trimmed || trimmed === "---") {
                            return null;
                          }

                          if (trimmed.startsWith("## ")) {
                            return (
                              <h3 key={index}>
                                {trimmed.replace(/^##\s+/, "")}
                              </h3>
                            );
                          }

                          if (trimmed.startsWith("### ")) {
                            return (
                              <h4 key={index}>
                                {trimmed.replace(/^###\s+/, "")}
                              </h4>
                            );
                          }

                          if (trimmed.startsWith("- ")) {
                            return (
                              <p key={index} className="feedback-bullet">
                                {trimmed}
                              </p>
                            );
                          }

                          return <p key={index}>{trimmed}</p>;
                        })}
                    </div>
                  )}
                </div>
              </article>
            )}
          </>
        ) : (
          <>
            <p className="history-eyebrow">YOUR PROGRESS</p>
            <h1>Interview History</h1>
            <p className="history-description">
              Review your previous AI-powered mock interviews.
            </p>

            {loading && <p>Loading your interviews...</p>}
            {error && <p className="history-error">{error}</p>}

            {!loading && !error && interviews.length === 0 && (
              <p>
                No interviews yet. Complete your first mock interview to see
                it here.
              </p>
            )}

            {!loading && !error && interviews.length > 0 && (
              <div className="history-list">
                {interviews.map((interview) => (
                  <article className="history-card" key={interview.runId}>
                    <div>
                      <h2>DSA Mock Interview</h2>
                      <p>
                        {interview.createdAt
                          ? new Date(interview.createdAt).toLocaleString()
                          : "Date unavailable"}
                      </p>
                    </div>

                    <div className="history-meta">
                      <span
                        className={`history-status ${interview.status}`}
                      >
                        {interview.status || "Unknown"}
                      </span>
                      <span>
                        {interview.duration
                          ? `${Math.floor(interview.duration / 60)}m ${
                              interview.duration % 60
                            }s`
                          : "Duration unavailable"}
                      </span>
                    </div>

                    <button
                      className="history-view-button"
                      onClick={() => {
                        window.location.href =
                          `/history?runId=${encodeURIComponent(
                            interview.runId
                          )}`;
                      }}
                    >
                      View interview review →
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default History; 