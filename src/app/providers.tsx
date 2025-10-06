// app/providers.tsx
"use client";

import { useEffect } from "react";
import { setupAmplify } from "@/lib/amplify-config";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => { setupAmplify(); }, []);
  return <>{children}</>;
}
