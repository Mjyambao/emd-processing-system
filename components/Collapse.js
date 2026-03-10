import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

function usePrefersReducedMotion() {
  const [prefersReduced, setPrefersReduced] = useState(false);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReduced(!!mq.matches);
    onChange();
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return prefersReduced;
}

// Collapsible container with height + opacity + slight translate
export default function Collapse({ open, children, className = "" }) {
  const ref = useRef(null);
  const prefersReduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced) {
      el.style.height = open ? "auto" : "0px";
      el.style.opacity = open ? "1" : "0";
      el.style.transform = "none";
      return;
    }
    const full = open ? `${el.scrollHeight}px` : "0px";
    el.style.height = full;
    el.style.opacity = open ? "1" : "0";
    el.style.transform = open ? "translateY(0px)" : "translateY(-4px)";
    if (open) {
      const id = setTimeout(() => {
        if (ref.current) ref.current.style.height = "auto";
      }, 250);
      return () => clearTimeout(id);
    }
  }, [open, prefersReduced]);

  return (
    <div
      ref={ref}
      className={`overflow-hidden transition-all duration-300 ease-out ${className}`}
      style={{
        height: open ? "auto" : 0,
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0px)" : "translateY(-4px)",
      }}
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}
