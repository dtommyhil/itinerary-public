import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <header>
        <Link className="brand" href="/">
          itinerary<span>✳</span>
        </Link>
        <Link className="badge" href="/login">
          Sign in / Sign up
        </Link>
      </header>
      <section className="hero">
        <p className="eyebrow">GOOD COMPANY. GREAT PLANS.</p>
        <h1>
          Your next adventure.
          <br />
          <em>All together.</em>
        </h1>
        <p className="intro">
          A shared home for the places you want to go, the plans you make, and
          the people coming along.
        </p>
        <a className="link" href="#coming-next">
          See what’s coming <span aria-hidden="true">↗</span>
        </a>
      </section>
      <section
        id="coming-next"
        className="features"
        aria-label="Planned features"
      >
        <article>
          <span className="number">01 / DISCOVER</span>
          <h2>Keep the good finds.</h2>
          <p>
            Save the little café, the perfect stay, and everything worth a
            detour.
          </p>
        </article>
        <article>
          <span className="number">02 / PLAN</span>
          <h2>Give each day a shape.</h2>
          <p>Turn everyone’s ideas into an itinerary with room to explore.</p>
        </article>
        <article>
          <span className="number">03 / TOGETHER</span>
          <h2>Bring everyone along.</h2>
          <p>One shared plan, built with the people who make the trip.</p>
        </article>
      </section>
      <footer>
        <span>Less back-and-forth. More getting out there.</span>
        <span>itinerary / project foundation</span>
      </footer>
    </main>
  );
}
