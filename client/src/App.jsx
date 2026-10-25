
import "./App.css";
import Interview from "./Interview";
import History from "./History";

function App() {
  const path = window.location.pathname;

  if (path === "/interview") {
    return <Interview />;
  }

  if (path === "/history") {
    return <History />;
  }

  return (
    <div className="app">
      <header className="navbar">
        <a className="brand" href="/" aria-label="InterviewAce home">
          Interview<span>Ace</span>
        </a>

        <span className="nav-tag">AI Interview Coach</span>
      </header>

      <main className="hero">
        <div className="pill">
          <span aria-hidden="true">✦</span>{" "}
          YOUR PERSONAL AI INTERVIEWER
        </div>

        <h1>
          Practice smarter.
          <br />
          <span>Interview better.</span>
        </h1>

        <p className="description">
          Build confidence for your next technical interview.
          Speak naturally, explain your thinking, and prepare
          for real-world coding interviews with your AI interviewer.
        </p>

        <section className="interview-option" aria-label="Available interview">
          <div className="avatar" aria-hidden="true">AI</div>

          <div className="card-text">
            <h2>DSA Mock Interview</h2>
            <p>Data Structures &amp; Algorithms · Beginner friendly</p>
          </div>

          <span
            className="status-dot"
            role="img"
            aria-label="Available"
            title="Available"
          />
        </section>

        <button
          type="button"
          className="start-button"
          onClick={() => {
            window.location.href = "/interview";
          }}
        >
          Start your interview <span aria-hidden="true">→</span>
        </button>

        <button
          type="button"
          className="start-button"
          onClick={() => {
            window.location.href = "/history";
          }}
        >
          View interview history <span aria-hidden="true">→</span>
        </button>

        <p className="note">No pressure. Just practice and improve.</p>
      </main>

      <footer>
        Built for learners who want to ace their next interview.
      </footer>
    </div>
  );
}

export default App; 