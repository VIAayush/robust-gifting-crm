"use client";

import React from "react";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast bg-white text-[#0D1B2A] border border-[#E2E8F0] shadow-md rounded-xl",
          description: "text-[#4A5568]",
          actionButton: "bg-[#C9A84C] text-white",
          cancelButton: "bg-[#EEF2F7] text-[#0D1B2A]",
        },
      }}
    />
  );
}
