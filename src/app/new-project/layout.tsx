"use client";

import React from "react";
import { WizardProvider } from "./wizard-context";

export default function NewProjectLayout({ children }: { children: React.ReactNode }) {
  return <WizardProvider>{children}</WizardProvider>;
}
