"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/auth-provider";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { RotateCcw, Home, Sparkles, Search, Heart, Calendar, Flame, TrendingUp, Lock, Gift, Rocket } from "lucide-react";
import posthog from "posthog-js";

// Funny fake search queries for the privacy demonstration
const FAKE_SEARCHES = [
  "how to mass reply on twitter",
  "why is my code not working",
  "is cereal a soup",
  "how to look busy at work",
  "can cats be vegan",
  "how to adult properly",
  "is water wet debate",
  "why do I hear boss music",
  "excel formulas for dummies",
  "how to unsend email outlook",
  "am I the main character",
  "professional way to say bruh",
  "how to pretend you know what you're doing",
  "why does Monday exist",
  "how to mute coworker in real life",
  "do plants get lonely",
  "is coffee actually bad for me",
  "how to fake productivity",
  "why do socks disappear",
  "best way to procrastinate",
  "how to unmeet someone",
  "why is my wi-fi always slow",
  "can you be too old for anime",
  "how to say no professionally",
  "is it normal to talk to yourself",
  "best excuses for being late",
  "why do I hate mornings",
  "how to fake being sick",
  "can you overdose on caffeine",
  "why is adulting so hard",
];

type Stage =
  | "loading"
  | "intro"
  | "intro-transition"
  | "fake-queries"
  | "queries-spread"
  | "privacy-reveal"
  | "stats-intro"
  | "stats-display"
  | "thank-you"
  | "finale";

export default function WrappedPage() {
  const router = useRouter();
  const { user, status, authToken } = useAuth();
  const [stage, setStage] = useState<Stage>("loading");
  const [displayedQueries, setDisplayedQueries] = useState<string[]>([]);
  const [showButtons, setShowButtons] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Wrapped 2025 | Tekir";
  }, []);

  // Fetch wrapped stats only when authenticated and we have auth credentials
  const wrappedStats = useQuery(
    api.wrapped.getWrappedStats,
    status === "authenticated" && user?.id && authToken
      ? { userId: user.id as any, authToken }
      : "skip"
  );

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/wrapped");
    }
  }, [status, router]);

  // Start the experience once data is loaded
  useEffect(() => {
    if (status === "authenticated" && wrappedStats !== undefined) {
      // Capture wrapped viewed event in PostHog
      posthog.capture('wrapped_viewed', {
        year: 2025,
        has_stats: !!wrappedStats?.stats,
        is_plus_member: wrappedStats?.user?.isPlusMember || false,
      });

      // Small delay before starting
      const timer = setTimeout(() => setStage("intro"), 500);
      return () => clearTimeout(timer);
    }
  }, [status, wrappedStats]);

  // Stage progression
  useEffect(() => {
    if (stage === "loading") return;

    const timings: Partial<Record<Stage, { next: Stage; delay: number }>> = {
      intro: { next: "intro-transition", delay: 3500 },
      "intro-transition": { next: "fake-queries", delay: 2500 },
      "fake-queries": { next: "queries-spread", delay: 6000 },
      "queries-spread": { next: "privacy-reveal", delay: 3000 },
      "privacy-reveal": { next: "stats-intro", delay: 4000 },
      "stats-intro": { next: "stats-display", delay: 2500 },
      "stats-display": { next: "thank-you", delay: 8000 },
      "thank-you": { next: "finale", delay: 4000 },
    };

    const current = timings[stage];
    if (current) {
      const timer = setTimeout(() => setStage(current.next), current.delay);
      return () => clearTimeout(timer);
    }

    // Show buttons in finale stage after a delay
    if (stage === "finale") {
      const timer = setTimeout(() => setShowButtons(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [stage]);

  // Animate fake queries appearing one by one
  useEffect(() => {
    if (stage !== "fake-queries") return;

    // Randomly select 6 queries from the list without repetition
    const shuffled = [...FAKE_SEARCHES].sort(() => Math.random() - 0.5);
    const queriesToShow = shuffled.slice(0, 6);
    let index = 0;

    const interval = setInterval(() => {
      if (index < queriesToShow.length) {
        setDisplayedQueries((prev) => [...prev, queriesToShow[index]]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 600);

    return () => clearInterval(interval);
  }, [stage]);

  const handleReplay = useCallback(() => {
    setStage("loading");
    setDisplayedQueries([]);
    setShowButtons(false);
    setTimeout(() => setStage("intro"), 500);
  }, []);

  const handleHome = useCallback(() => {
    router.push("/");
  }, [router]);

  // Loading state
  if (status === "loading" || (status === "authenticated" && wrappedStats === undefined)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-gray-50/30 dark:to-gray-950/10 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="mx-auto mb-4 space-y-2 max-w-xs" aria-label="Preparing your 2025 recap">
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse-fast mx-auto" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse-fast mx-auto" />
            <div className="h-3 w-32 rounded bg-muted animate-pulse-fast mx-auto" />
          </div>
          <p className="text-foreground/50 text-sm">Preparing your 2025 recap...</p>
        </motion.div>
      </div>
    );
  }

  // Don't render anything while redirecting
  if (status === "unauthenticated") {
    return null;
  }

  const stats = wrappedStats?.stats;
  const userName = wrappedStats?.user?.name || "Explorer";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-gray-50/30 dark:to-gray-950/10 overflow-hidden relative">
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {/* Stage: Intro */}
          {stage === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="text-center max-w-2xl"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Sparkles className="w-12 h-12 text-foreground/40 mx-auto mb-6" />
              </motion.div>
              <motion.h1
                className="text-4xl md:text-6xl font-bold text-foreground mb-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                We used Tekir to search for{" "}
                <span className="text-foreground/70">
                  everything
                </span>{" "}
                this year
              </motion.h1>
            </motion.div>
          )}

          {/* Stage: Intro Transition */}
          {stage === "intro-transition" && (
            <motion.div
              key="intro-transition"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.6 }}
              className="text-center max-w-2xl"
            >
              <h2 className="text-3xl md:text-5xl font-bold text-foreground">
                Let&apos;s see how{" "}
                <span className="text-foreground/70">
                  you
                </span>{" "}
                searched.
              </h2>
            </motion.div>
          )}

          {/* Stage: Fake Queries */}
          {stage === "fake-queries" && (
            <motion.div
              key="fake-queries"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center max-w-4xl w-full px-4"
            >
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-foreground/50 text-sm mb-12 font-medium tracking-wide"
              >
                Your searches this year...
              </motion.p>
              <motion.div 
                className="flex flex-wrap justify-center gap-3 sm:gap-4"
                initial="hidden"
                animate="visible"
                variants={{
                  visible: {
                    transition: {
                      staggerChildren: 0.08,
                      delayChildren: 0.2,
                    },
                  },
                }}
              >
                {displayedQueries.map((query, index) => (
                  <motion.div
                    key={index}
                    variants={{
                      hidden: { 
                        opacity: 0, 
                        scale: 0.6,
                        y: 30,
                      },
                      visible: {
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        transition: {
                          type: "spring",
                          stiffness: 300,
                          damping: 25,
                          mass: 0.5,
                        },
                      },
                    }}
                    whileHover={{ 
                      scale: 1.08,
                      backgroundColor: "var(--foreground-rgb)",
                      opacity: 0.5,
                    }}
                    transition={{ duration: 0.2 }}
                    className="bg-foreground/5 hover:bg-foreground/10 backdrop-blur-sm border border-foreground/10 hover:border-foreground/20 rounded-full px-4 py-2.5 text-foreground/80 text-sm md:text-base font-medium cursor-default transition-colors duration-200"
                  >
                    <Search className="w-3.5 h-3.5 inline-block mr-2.5 opacity-50" />
                    {query}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* Stage: Queries Spread */}
          {stage === "queries-spread" && (
            <motion.div
              key="queries-spread"
              className="relative w-full h-screen"
            >
              {displayedQueries.map((query, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 1, scale: 1 }}
                  animate={{
                    x: (Math.random() - 0.5) * 600,
                    y: (Math.random() - 0.5) * 400,
                    rotate: (Math.random() - 0.5) * 30,
                    opacity: 0.5,
                  }}
                  transition={{
                    duration: 1.2,
                    ease: "easeOut",
                  }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-foreground/5 backdrop-blur-sm border border-foreground/10 rounded-full px-4 py-2 text-foreground/70 text-sm whitespace-nowrap"
                >
                  {query}
                </motion.div>
              ))}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <h2 className="text-2xl md:text-4xl font-bold text-foreground text-center px-4">
                  Those searches were{" "}
                  <span className="text-foreground/60">embarrassing</span>, right?
                </h2>
              </motion.div>
            </motion.div>
          )}

          {/* Stage: Privacy Reveal */}
          {stage === "privacy-reveal" && (
            <motion.div
              key="privacy-reveal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ duration: 0.8 }}
              className="text-center max-w-2xl px-4"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.3 }}
                className="w-20 h-20 bg-foreground/10 rounded-full flex items-center justify-center mx-auto mb-8"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  <Lock className="w-10 h-10 text-foreground/60" />
                </motion.div>
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-3xl md:text-5xl font-bold text-foreground mb-4"
              >
                Fortunately, Tekir{" "}
                <span className="text-foreground/70">
                  doesn&apos;t track
                </span>{" "}
                your searches
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-lg text-foreground/50"
              >
                Those were just fake queries. Your real searches stay private. Always.
              </motion.p>
            </motion.div>
          )}

          {/* Stage: Stats Intro */}
          {stage === "stats-intro" && (
            <motion.div
              key="stats-intro"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.6 }}
              className="text-center"
            >
              <h2 className="text-3xl md:text-5xl font-bold text-foreground">
                But here&apos;s what we{" "}
                <span className="text-foreground/70">
                  do
                </span>{" "}
                know...
              </h2>
            </motion.div>
          )}

          {/* Stage: Stats Display */}
          {stage === "stats-display" && stats && (
            <motion.div
              key="stats-display"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-4xl px-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-12"
              >
                <p className="text-foreground/40 text-sm uppercase tracking-wider mb-2">
                  Your 2025 in numbers
                </p>
                <h2 className="text-2xl md:text-4xl font-bold text-foreground">
                  Hey{" "}
                  <span className="text-foreground/70">
                    {userName}
                  </span>
                  !
                </h2>
              </motion.div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <StatCard
                  icon={<Search className="w-5 h-5" />}
                  value={stats.totalSearches.toLocaleString()}
                  label="Total Searches"
                  delay={0.1}
                  color="bg-foreground/10"
                />
                <StatCard
                  icon={<TrendingUp className="w-5 h-5" />}
                  value={stats.dailyAverage.toLocaleString()}
                  label="Daily Average"
                  delay={0.2}
                  color="bg-foreground/10"
                />
                <StatCard
                  icon={<Calendar className="w-5 h-5" />}
                  value={stats.daysActive.toString()}
                  label="Days Active"
                  delay={0.3}
                  color="bg-foreground/10"
                />
                <StatCard
                  icon={<Flame className="w-5 h-5" />}
                  value={`${stats.longestStreak}`}
                  label="Day Streak"
                  delay={0.4}
                  color="bg-foreground/10"
                />
              </div>

              {stats.mostActiveMonth && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="mt-8 text-center"
                >
                  <p className="text-foreground/50 text-sm">
                    Your most active month was{" "}
                    <span className="text-foreground/70 font-semibold">
                      {stats.mostActiveMonth}
                    </span>{" "}
                    with{" "}
                    <span className="text-foreground/70 font-semibold">
                      {stats.mostActiveMonthCount.toLocaleString()}
                    </span>{" "}
                    searches
                  </p>
                </motion.div>
              )}

              {stats.likesGiven > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="mt-4 text-center"
                >
                  <p className="text-foreground/50 text-sm flex items-center justify-center gap-2">
                    <Heart className="w-4 h-4 text-foreground/40" />
                    You gave{" "}
                    <span className="text-foreground/70 font-semibold">
                      {stats.likesGiven}
                    </span>{" "}
                    likes to help us improve
                  </p>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Stage: Thank You */}
          {stage === "thank-you" && (
            <motion.div
              key="thank-you"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="text-center max-w-2xl px-4"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 150, delay: 0.2 }}
                className="mb-8"
              >
                <Gift className="w-16 h-16 text-foreground/40 mx-auto" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-3xl md:text-5xl font-bold text-foreground mb-4"
              >
                Thank you for being part of{" "}
                <span className="text-foreground/70">
                  Tekir&apos;s journey
                </span>
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-lg text-foreground/50"
              >
                {wrappedStats?.user?.isPlusMember
                  ? "As a Tekir Plus member, you've helped shape the future of private search."
                  : "Together, we're building a more private internet."}
              </motion.p>
            </motion.div>
          )}

          {/* Stage: Finale */}
          {stage === "finale" && (
            <motion.div
              key="finale"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center max-w-2xl px-4"
            >
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 100 }}
                className="mb-8"
              >
                <div className="text-8xl md:text-9xl font-bold text-foreground/20">
                  2026
                </div>
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-xl text-foreground/60 mb-12 flex items-center justify-center gap-2"
              >
                Here&apos;s to another year of private searching!
                <Rocket className="w-5 h-5 text-foreground/40" />
              </motion.p>

              <AnimatePresence>
                {showButtons && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex flex-col sm:flex-row gap-4 justify-center"
                  >
                    <motion.button
                      onClick={handleReplay}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-foreground/10 hover:bg-foreground/15 border border-foreground/20 rounded-full text-foreground font-medium transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Replay
                    </motion.button>
                    <motion.button
                      onClick={handleHome}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-foreground hover:bg-foreground/80 rounded-full text-background font-medium transition-colors"
                    >
                      <Home className="w-4 h-4" />
                      Back Home
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Stat card component
function StatCard({
  icon,
  value,
  label,
  delay,
  color,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  delay: number;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 150 }}
      className="bg-foreground/5 backdrop-blur-sm border border-foreground/10 rounded-2xl p-4 md:p-6"
    >
      <div
        className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center text-foreground mb-3`}
      >
        {icon}
      </div>
      <div className="text-2xl md:text-3xl font-bold text-foreground mb-1">{value}</div>
      <div className="text-xs md:text-sm text-foreground/40">{label}</div>
    </motion.div>
  );
}
