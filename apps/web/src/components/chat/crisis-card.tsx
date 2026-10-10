export function CrisisCard() {
  return (
    <aside
      role="note"
      aria-label="Support resources"
      className="rise rounded-lg border border-sindoor/35 bg-sindoor-wash/70 px-5 py-4 font-sans text-[0.9375rem] leading-relaxed text-ink"
    >
      <p className="font-serif text-lg italic">
        You don't have to carry this alone.
      </p>
      <p className="mt-1 text-ink-soft">
        Talking to someone right now can help. These lines are free and
        confidential.
      </p>
      <ul className="mt-3 space-y-1.5">
        <li>
          <span className="font-semibold">India:</span> Tele-MANAS{" "}
          <a
            className="font-semibold text-sindoor underline underline-offset-2"
            href="tel:14416"
          >
            14416
          </a>{" "}
          or{" "}
          <a
            className="font-semibold text-sindoor underline underline-offset-2"
            href="tel:18008914416"
          >
            1-800-891-4416
          </a>{" "}
          (24x7)
        </li>
        <li>
          <span className="font-semibold">United States:</span> call or text{" "}
          <a
            className="font-semibold text-sindoor underline underline-offset-2"
            href="tel:988"
          >
            988
          </a>
        </li>
        <li>
          <span className="font-semibold">Anywhere else:</span>{" "}
          <a
            className="font-semibold text-sindoor underline underline-offset-2"
            href="https://findahelpline.com"
            target="_blank"
            rel="noreferrer"
          >
            findahelpline.com
          </a>
        </li>
      </ul>
      <p className="mt-3 text-ink-soft">
        If you are in immediate danger, call your local emergency number (112 in
        India).
      </p>
    </aside>
  );
}
