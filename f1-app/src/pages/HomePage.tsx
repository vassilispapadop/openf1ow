// Home page — flat cards, bold data, no decorative chrome.
// Latest race, next race, season calendar. That's it.

import { useSession } from "../contexts/SessionContext";
import LatestRaceCard from "../components/home/LatestRaceCard";
import NextRaceCard from "../components/home/NextRaceCard";
import SeasonGrid from "../components/home/SeasonGrid";
import HotStats from "../components/home/HotStats";

export default function HomePage() {
  const { year } = useSession();

  return (
    <>
      {/* Latest race — the hero card */}
      <section style={{ marginBottom: 32 }}>
        <LatestRaceCard year={year} />
      </section>

      {/* Hot stats — key insights at a glance */}
      <section style={{ marginBottom: 32 }}>
        <HotStats year={year} />
      </section>

      {/* Next race — countdown */}
      <section style={{ marginBottom: 32 }}>
        <NextRaceCard year={year} />
      </section>

      {/* Season calendar */}
      <section style={{ marginBottom: 32 }}>
        <SeasonGrid year={year} />
      </section>
    </>
  );
}
