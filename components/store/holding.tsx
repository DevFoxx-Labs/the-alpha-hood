/** Shown in production until a real commerce platform + CMS are configured (never demo data). */
export function Holding() {
  return (
    <section className="on-dark grid min-h-[70dvh] place-items-center bg-black px-6 text-center text-white">
      <div className="flex flex-col items-center gap-5">
        <h1 className="font-display text-[62px] uppercase leading-[0.86] text-volt lg:text-[148px]">
          Coming
          <br />
          soon
        </h1>
        <p className="text-[14px] text-white/70">Built for the ones who lead.</p>
      </div>
    </section>
  );
}
