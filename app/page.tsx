import RavenTransition from "@/components/RavenTransition";

export default function Page() {
  return (
    <main className="page">
      <div className="content">
        <header>
          <h1>Raven Transition Studio</h1>
          <p>
            Craft a dramatic raven-inspired wipe between two still frames. Upload your own
            imagery, tweak the timing, and launch the sweeping reveal.
          </p>
        </header>
        <RavenTransition />
      </div>
      <footer>
        <span>Tip:</span>
        <ul>
          <li>Use high-resolution frames to keep the transition razor sharp.</li>
          <li>Trigger multiple times to flip back and forth between the two images.</li>
        </ul>
      </footer>
    </main>
  );
}
