"use client";
// Scroll-into-view motion for the marketing pages: one Reveal wrapper, one stagger group.
// Design stays untouched; things just arrive instead of appearing.
import { motion, stagger } from "motion/react";

export function Reveal({ children, delay = 0, lift = 24, className }: { children: React.ReactNode; delay?: number; lift?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: lift }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay, ease: [0.21, 0.6, 0.35, 1] }}>
      {children}
    </motion.div>
  );
}

/** Children fade/slide in one after another as the group scrolls into view. */
export function RevealGroup({ children, className, gap = 0.09 }: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div className={className} initial="off" whileInView="on" viewport={{ once: true, margin: "-60px" }}
                variants={{ on: { transition: { staggerChildren: gap } } }}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, lift = 24 }: { children: React.ReactNode; className?: string; lift?: number }) {
  return (
    <motion.div className={className} variants={{
      off: { opacity: 0, y: lift },
      on: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.21, 0.6, 0.35, 1] } },
    }}>
      {children}
    </motion.div>
  );
}

/** A card that lifts slightly toward the cursor. Wrap static cards; the design doesn't change. */
export function HoverLift({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} whileHover={{ y: -4 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
      {children}
    </motion.div>
  );
}
