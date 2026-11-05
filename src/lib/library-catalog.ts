/** Stable metadata only. Resource content is deliberately server-only. */
export interface LibraryResource {
  id: string;
  title: string;
  category: string;
  section: "administrative" | "pedagogical";
  description: string;
}
export interface ResourceTemplate extends LibraryResource {
  placeholders: string[];
  content: string;
}

/** Duplicates retain the original resource permission, including legacy copies. */
export function librarySourceId(resourceId: string): string {
  return resourceId.split("-copy-")[0] ?? resourceId;
}

export const LIBRARY_CATALOG: LibraryResource[] = [
  // ADMINISTRATIVE RESOURCES
  // Contracts
  {
    id: "admin-student-contract",
    title: "Student Contract",
    category: "contracts",
    section: "administrative",
    description: "Agreement outlining payment terms, cancellations, and class attendance.",
  },
  {
    id: "admin-parent-contract",
    title: "Parent Contract",
    category: "contracts",
    section: "administrative",
    description: "Agreement for minor students, outlining parental responsibility and payment.",
  },
  {
    id: "admin-corporate-contract",
    title: "Corporate Contract",
    category: "contracts",
    section: "administrative",
    description: "Agreement for business/corporate clients with custom invoicing conditions.",
  },
  {
    id: "admin-private-agreement",
    title: "Private Lesson Agreement",
    category: "contracts",
    section: "administrative",
    description: "Informal, lightweight agreement for single private students.",
  },
  // Finance
  {
    id: "admin-invoice",
    title: "Invoice Template",
    category: "finance",
    section: "administrative",
    description: "Professional, customizable layout for monthly lesson billing.",
  },
  {
    id: "admin-receipt",
    title: "Receipt Template",
    category: "finance",
    section: "administrative",
    description: "Official payment receipt format to send to students or sponsors.",
  },
  {
    id: "admin-payment-agreement",
    title: "Payment Agreement",
    category: "finance",
    section: "administrative",
    description: "Agreement outlining payment plan/installments for large packages.",
  },
  {
    id: "admin-refund-form",
    title: "Refund Form",
    category: "finance",
    section: "administrative",
    description: "Formal documentation of class credits or balance refunds.",
  },
  {
    id: "admin-price-list",
    title: "Price List",
    category: "finance",
    section: "administrative",
    description: "Professional rate card to share with prospective clients.",
  },
  // Communication
  {
    id: "admin-welcome",
    title: "Welcome Message",
    category: "communication",
    section: "administrative",
    description: "Onboarding email template to send to new students.",
  },
  {
    id: "admin-reminder",
    title: "Payment Reminder",
    category: "communication",
    section: "administrative",
    description: "Polite payment notice to send via email or WhatsApp.",
  },
  {
    id: "admin-renewal",
    title: "Renewal Message",
    category: "communication",
    section: "administrative",
    description: "Upsell/renewal notification to send before a package ends.",
  },
  {
    id: "admin-cancellation",
    title: "Cancellation Response",
    category: "communication",
    section: "administrative",
    description: "Professional, warm response handling a student's cancellation.",
  },
  {
    id: "admin-follow-up",
    title: "Follow-up Template",
    category: "communication",
    section: "administrative",
    description: "Nurturing email template for leads who haven't booked yet.",
  },
  // Business
  {
    id: "admin-policies",
    title: "School Policies",
    category: "business",
    section: "administrative",
    description: "General code of conduct and class booking guidelines.",
  },

  // PEDAGOGICAL RESOURCES
  // Placement
  {
    id: "ped-placement-test",
    title: "Placement Test Guidelines",
    category: "placement",
    section: "pedagogical",
    description: "Guidelines and scoring criteria for new student intake tests.",
  },
  {
    id: "ped-speaking-rubric",
    title: "Speaking Rubric",
    category: "placement",
    section: "pedagogical",
    description: "Intake evaluation card focusing strictly on spoken communication.",
  },
  // Assessment
  {
    id: "ped-progress-report",
    title: "Progress Report",
    category: "assessment",
    section: "pedagogical",
    description: "Standard mid-term feedback form detailing strengths and goals.",
  },
  {
    id: "ped-semester-report",
    title: "Semester Report",
    category: "assessment",
    section: "pedagogical",
    description: "End of semester final evaluation format.",
  },
  // Student Records
  {
    id: "ped-student-goals",
    title: "Student Learning Goals",
    category: "records",
    section: "pedagogical",
    description: "Intake profile sheet tracking motivation and goals.",
  },
  // Planning
  {
    id: "ped-semester-planner",
    title: "Semester Planner",
    category: "planning",
    section: "pedagogical",
    description: "High-level syllabus framework template.",
  },
  // Certificates
  {
    id: "ped-course-certificate",
    title: "Course Completion Certificate",
    category: "certificates",
    section: "pedagogical",
    description: "Standard certificate structure for course graduates.",
  },
  {
    id: "ped-attendance-certificate",
    title: "Attendance Certificate",
    category: "certificates",
    section: "pedagogical",
    description: "Official confirmation of course attendance hours.",
  },
];

