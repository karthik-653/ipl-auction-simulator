import { useSave } from "../save/SaveContext";
import "./Home.css";

function Home() {
  const { saveInfo, requestNewGame, continueGame, busy } = useSave();
  const meta = saveInfo.meta;

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">🎭 EXPERIENCE THE AUCTION</div>
          <h1 className="hero-title">IPL Auction Simulator</h1>
          <p className="hero-subtitle">
            Take control of your franchise. Build your dream squad. Experience
            the thrill of the auction like never before.
          </p>
          {saveInfo.exists && !meta?.corrupt && (
            <button className="hero-cta-btn" onClick={continueGame} disabled={busy}>
              Continue Game
              {meta?.teamName ? ` · ${meta.teamName}` : ""}
              {meta?.auctionStarted ? ` (player ${Math.min(meta.playerIndex + 1, meta.queueLength)}/${meta.queueLength})` : ""}
            </button>
          )}
          <button
            className={saveInfo.exists ? "hero-cta-btn hero-secondary-btn" : "hero-cta-btn"}
            onClick={requestNewGame}
            disabled={busy}
          >
            {saveInfo.exists ? "New Game" : "Start Your Auction Journey"}
          </button>
        </div>
        <div className="hero-visual">
          <div className="hero-card card-1">💰</div>
          <div className="hero-card card-2">🏏</div>
          <div className="hero-card card-3">⚡</div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="features-header">
          <h2>Everything You Need</h2>
          <p>Master the art of franchise building</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3>Strategic Selection</h3>
            <p>
              Choose your franchise from 10 IPL teams and build from scratch
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">👥</div>
            <h3>Smart Retention</h3>
            <p>
              Strategically retain your best players or release them to auction
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔥</div>
            <h3>Live Bidding</h3>
            <p>Compete against AI teams in a realistic auction environment</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Analytics & Insights</h3>
            <p>Track your team's performance and auction statistics</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🎪</div>
            <h3>Multiple Sets</h3>
            <p>Navigate through marquee, platinum, and other auction sets</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🏆</div>
            <h3>Complete Squad</h3>
            <p>Build a balanced team with batters, bowlers, and all-rounders</p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works">
        <h2>How It Works</h2>
        <div className="steps-container">
          <div className="step">
            <div className="step-number">1</div>
            <h3>Select Team</h3>
            <p>Choose your franchise with a starting purse of ₹120 Cr</p>
          </div>

          <div className="step-arrow">→</div>

          <div className="step">
            <div className="step-number">2</div>
            <h3>Retain Players</h3>
            <p>Decide which players to retain from the available pool</p>
          </div>

          <div className="step-arrow">→</div>

          <div className="step">
            <div className="step-number">3</div>
            <h3>Bid & Build</h3>
            <p>Participate in live bidding across multiple auction sets</p>
          </div>

          <div className="step-arrow">→</div>

          <div className="step">
            <div className="step-number">4</div>
            <h3>View Summary</h3>
            <p>Analyze your final squad and tournament readiness</p>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats">
        <div className="stat-item">
          <div className="stat-number">10</div>
          <div className="stat-label">Franchise Teams</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">1000+</div>
          <div className="stat-label">Players in Pool</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">120 Cr</div>
          <div className="stat-label">Starting Purse</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">∞</div>
          <div className="stat-label">Possibilities</div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="final-cta">
        <h2>Ready to Build Your Dream Squad?</h2>
        <p>Create the perfect team. Win the auction. Dominate the league.</p>
        <button className="cta-btn-large" onClick={requestNewGame}>
          Begin Now →
        </button>
      </section>
    </div>
  );
}

export default Home;
