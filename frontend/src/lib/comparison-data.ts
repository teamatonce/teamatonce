export type FeatureValue = "full" | "basic" | "partial" | false;

export interface ComparisonRow {
  feature: string;
  teamatonce: FeatureValue;
  upwork: FeatureValue;
  deel: FeatureValue;
  toptal: FeatureValue;
  fiverr: FeatureValue;
  desc: string;
}

export const comparisonData: ComparisonRow[] = [
  { feature: "AI-Powered Matching", teamatonce: "full", upwork: false, deel: false, toptal: "partial", fiverr: false, desc: "Natural language search with intelligent matching" },
  { feature: "Built-in Project Management", teamatonce: "full", upwork: "basic", deel: false, toptal: false, fiverr: false, desc: "Kanban boards, time tracking, milestones" },
  { feature: "Secure Escrow Payments", teamatonce: "full", upwork: "full", deel: false, toptal: "full", fiverr: "full", desc: "Milestone-based payment protection" },
  { feature: "Video Collaboration", teamatonce: "full", upwork: false, deel: false, toptal: false, fiverr: false, desc: "Built-in video calls and screen sharing" },
  { feature: "Multi-Currency Support", teamatonce: "full", upwork: "full", deel: "full", toptal: "partial", fiverr: "full", desc: "170+ currencies supported" },
  { feature: "Smart Contracts", teamatonce: "full", upwork: "basic", deel: "full", toptal: false, fiverr: "basic", desc: "Auto-generated with e-signature" },
  { feature: "Team Workspaces", teamatonce: "full", upwork: false, deel: false, toptal: false, fiverr: false, desc: "Organize multiple projects and teams" },
  { feature: "Real-Time Chat", teamatonce: "full", upwork: "basic", deel: false, toptal: false, fiverr: "basic", desc: "Instant messaging with file sharing" },
  { feature: "Automatic Invoicing", teamatonce: "full", upwork: "full", deel: "full", toptal: "partial", fiverr: "basic", desc: "Tax-compliant invoices generated" },
  { feature: "Global Payroll", teamatonce: "full", upwork: false, deel: "full", toptal: false, fiverr: false, desc: "Handle international payments easily" },
  { feature: "Skill Verification", teamatonce: "full", upwork: "basic", deel: false, toptal: "full", fiverr: "basic", desc: "Test and verify technical skills" },
  { feature: "Dispute Resolution", teamatonce: "full", upwork: "full", deel: "partial", toptal: "full", fiverr: "full", desc: "Mediation and arbitration support" },
  { feature: "File Storage", teamatonce: "full", upwork: "basic", deel: false, toptal: false, fiverr: "basic", desc: "Unlimited project file storage" },
  { feature: "API Access", teamatonce: "full", upwork: "partial", deel: "full", toptal: false, fiverr: false, desc: "Integrate with your existing tools" },
  { feature: "White Label Options", teamatonce: "full", upwork: false, deel: false, toptal: false, fiverr: false, desc: "Customize platform for your brand" }
];

export interface PlatformFee {
  platform: string;
  fee: string;
  note?: string;
}

export const platformFees: Record<string, PlatformFee> = {
  teamatonce: { platform: "Team@Once", fee: "3-5%", note: "Lowest in industry" },
  upwork: { platform: "Upwork", fee: "10-20%" },
  deel: { platform: "Deel", fee: "Custom" },
  toptal: { platform: "Toptal", fee: "None*", note: "+2x markup" },
  fiverr: { platform: "Fiverr", fee: "20%" }
};
