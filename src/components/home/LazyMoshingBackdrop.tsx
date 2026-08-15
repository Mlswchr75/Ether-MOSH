import { useEffect, useState } from "react";
import { MoshingBackdrop } from "./MoshingBackdrop";

export const LazyMoshingBackdrop = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => setMounted(true), { timeout: 2000 });
    } else {
      setTimeout(() => setMounted(true), 0);
    }
  }, []);

  return mounted ? <MoshingBackdrop /> : null;
};
