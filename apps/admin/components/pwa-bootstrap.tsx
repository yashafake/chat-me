"use client";

import { useEffect } from "react";

const ADMIN_BASE_PATH = "/admin";

export function PwaBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register(`${ADMIN_BASE_PATH}/sw.js`, {
      scope: `${ADMIN_BASE_PATH}/`
    }).catch(() => {
      return;
    });
  }, []);

  return null;
}
