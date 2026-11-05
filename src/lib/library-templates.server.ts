import type { ResourceTemplate } from "./library-catalog";

// Server-only: preserve original templates verbatim; never bundle the contents in browsers.
export const LIBRARY_TEMPLATES: ResourceTemplate[] = [
  // ADMINISTRATIVE RESOURCES
  // Contracts
  {
    id: "admin-student-contract",
    title: "Student Contract",
    category: "contracts",
    section: "administrative",
    description: "Agreement outlining payment terms, cancellations, and class attendance.",
    placeholders: [
      "Student Name",
      "Teacher Name",
      "Effective Date",
      "Hourly Rate",
      "Cancellation Policy Hours",
    ],
    content: `# CLASS TUITION & TERMS AGREEMENT

This Agreement is entered into on [Effective Date] between [Teacher Name] (the "Teacher") and [Student Name] (the "Student").

## 1. Class Schedule & Fees
The Teacher agrees to deliver customized language instruction to the Student.
- **Tuition Fee:** [Hourly Rate] per hour, billed monthly.
- **Payment Due:** Within 5 business days after invoice issue.

## 2. Cancellation Policy
- Cancellations or schedule changes must be requested at least **[Cancellation Policy Hours] hours** in advance.
- Late cancellations made with less notice will be billed at the full rate.
- No-shows without notice will be charged in full.

## 3. Materials & Access
The Student is responsible for procuring any required course textbooks or licensing fees.

Teacher Signature: _______________________
Student Signature: _______________________`,
  },
  {
    id: "admin-parent-contract",
    title: "Parent Contract",
    category: "contracts",
    section: "administrative",
    description: "Agreement for minor students, outlining parental responsibility and payment.",
    placeholders: [
      "Parent Name",
      "Student Name",
      "Teacher Name",
      "Monthly Tuition",
      "Payment Due Day",
    ],
    content: `# TUTORING AGREEMENT FOR MINORS

Parent Name: [Parent Name]
Student Name: [Student Name]
Teacher Name: [Teacher Name]

## 1. Scope of Work & Tuition
- Instruction is tailored to [Student Name]'s language goals.
- **Tuition:** [Monthly Tuition] per month.
- **Due Date:** Payment must be made by the **[Payment Due Day]** of each month.

## 2. Attendance & Safety
- Classes start and end promptly on schedule.
- Parents are responsible for picking up or dropping off students at the specified hours.
- Cancellations require a 24-hour notice, or the class credit is forfeit.

Parent Signature: _______________________`,
  },
  {
    id: "admin-corporate-contract",
    title: "Corporate Contract",
    category: "contracts",
    section: "administrative",
    description: "Agreement for business/corporate clients with custom invoicing conditions.",
    placeholders: [
      "Company Name",
      "Contact Person",
      "Monthly Hours",
      "Hourly Rate",
      "Billing Period",
    ],
    content: `# B2B LANGUAGE SERVICES AGREEMENT

Agreement between [Company Name] (represented by [Contact Person]) and the Service Provider.

## 1. Corporate Training Services
Instruction in Professional/Business English will be delivered to employees of [Company Name].
- **Volume:** Estimated [Monthly Hours] hours per month.
- **Rate:** [Hourly Rate] per hour.
- **Billing Period:** [Billing Period] (e.g., net 15, net 30).

## 2. Confidentiality
Both parties agree to treat all business information and curricula shared during class as strictly confidential.

Company Authorized Signature: _______________________`,
  },
  {
    id: "admin-private-agreement",
    title: "Private Lesson Agreement",
    category: "contracts",
    section: "administrative",
    description: "Informal, lightweight agreement for single private students.",
    placeholders: ["Student Name", "Weekly Hours", "Schedule Details", "Rate Per Lesson"],
    content: `# PRIVATE LESSON AGREEMENT

Student Name: [Student Name]

## 1. Schedule
- The Student commits to **[Weekly Hours] hours** of lessons per week.
- **Lesson Schedule:** [Schedule Details]
- **Rate:** [Rate Per Lesson] per lesson.

## 2. Cancellation
Lessons must be rescheduled 24 hours prior to class, or they will be counted as completed.`,
  },
  // Finance
  {
    id: "admin-invoice",
    title: "Invoice Template",
    category: "finance",
    section: "administrative",
    description: "Professional, customizable layout for monthly lesson billing.",
    placeholders: [
      "Invoice Number",
      "Student Name",
      "Billing Date",
      "Due Date",
      "Lessons Completed",
      "Amount Due",
    ],
    content: `# INVOICE #[Invoice Number]

**Date:** [Billing Date]  
**Due Date:** [Due Date]

### Billed To:
[Student Name]

---

| Description | Qty | Rate | Total |
|---|---|---|---|
| Customized Language Lessons | [Lessons Completed] | (As per agreement) | [Amount Due] |

**Total Balance Due:** [Amount Due]

### Payment Methods:
- Bank Transfer / Pix
- Stripe / PayPal

*Thank you for your business!*`,
  },
  {
    id: "admin-receipt",
    title: "Receipt Template",
    category: "finance",
    section: "administrative",
    description: "Official payment receipt format to send to students or sponsors.",
    placeholders: [
      "Receipt Number",
      "Student Name",
      "Payment Date",
      "Amount Paid",
      "Payment Method",
    ],
    content: `# PAYMENT RECEIPT #[Receipt Number]

**Date of Payment:** [Payment Date]

### Billed To:
[Student Name]

### Payment Received:
- **Amount Paid:** [Amount Paid]
- **Payment Method:** [Payment Method]

This document serves as proof of payment for tutoring services rendered.

*Status: PAID / QUITADO*`,
  },
  {
    id: "admin-payment-agreement",
    title: "Payment Agreement",
    category: "finance",
    section: "administrative",
    description: "Agreement outlining payment plan/installments for large packages.",
    placeholders: [
      "Student Name",
      "Total Course Cost",
      "Installment Amount",
      "Number of Installments",
      "Due Day",
    ],
    content: `# COURSE TUITION PAYMENT PLAN

Student Name: [Student Name]

The total course tuition of **[Total Course Cost]** will be distributed in installments under the following terms:

- **Installment Amount:** [Installment Amount]
- **Number of Payments:** [Number of Installments]
- **Payment Due Date:** Due on the **[Due Day]** of each month.

Late payments exceeding 5 business days will result in a temporary suspension of lessons.`,
  },
  {
    id: "admin-refund-form",
    title: "Refund Form",
    category: "finance",
    section: "administrative",
    description: "Formal documentation of class credits or balance refunds.",
    placeholders: ["Student Name", "Original Payment Date", "Refund Amount", "Reason for Refund"],
    content: `# TUITION REFUND RECEIPT

**Refund Date:** (Current Date)

### Recipient:
[Student Name]

- **Original Payment Date:** [Original Payment Date]
- **Approved Refund Amount:** [Refund Amount]
- **Reason for Refund:** [Reason for Refund]

By signing this receipt, the Student acknowledges full and final settlement of all class credits.

Signature: _______________________`,
  },
  {
    id: "admin-price-list",
    title: "Price List",
    category: "finance",
    section: "administrative",
    description: "Professional rate card to share with prospective clients.",
    placeholders: [
      "Effective Date",
      "Private Hourly Rate",
      "Group Monthly Rate",
      "Package 10-Hour Rate",
    ],
    content: `# LANGUAGE TRAINING PRICING CARD

**Effective Date:** [Effective Date]

### Private Classes (1-on-1)
- **Hourly rate:** [Private Hourly Rate]
- Tailored plans, premium material, flexible scheduling.

### Group Classes (Max 5 students)
- **Monthly Tuition:** [Group Monthly Rate] per student.
- Fixed schedules, conversational focus.

### Block Packages
- **10-Hour Prepaid Package:** [Package 10-Hour Rate]`,
  },
  // Communication
  {
    id: "admin-welcome",
    title: "Welcome Message",
    category: "communication",
    section: "administrative",
    description: "Onboarding email template to send to new students.",
    placeholders: ["Student Name", "Course Name", "Next Class Date", "Material Link"],
    content: `Subject: Welcome to [Course Name]!

Hi [Student Name],

I am thrilled to welcome you to our language program! Our main goal is to help you build confidence and master your target skills.

Here are the key details for your onboarding:
- **First Class:** [Next Class Date]
- **Access Link / Classroom:** (Zoom/Meet/Physical address details here)
- **Student Portal & Material:** [Material Link]

Please take 5 minutes to review our welcome kit and syllabus before the first lesson. Let me know if you have any questions!

Best regards,
Your Teacher`,
  },
  {
    id: "admin-reminder",
    title: "Payment Reminder",
    category: "communication",
    section: "administrative",
    description: "Polite payment notice to send via email or WhatsApp.",
    placeholders: ["Student Name", "Amount Due", "Due Date", "Payment Link"],
    content: `Subject: Tuition Payment Reminder - [Student Name]

Hi [Student Name],

I hope you are enjoying our lessons! This is a gentle reminder that the invoice for this billing period is due shortly.

- **Amount:** [Amount Due]
- **Due Date:** [Due Date]
- **Payment Link/Details:** [Payment Link]

If you have already made the transfer, please disregard this message or reply with the receipt. Thank you!

Best regards,
Your Teacher`,
  },
  {
    id: "admin-renewal",
    title: "Renewal Message",
    category: "communication",
    section: "administrative",
    description: "Upsell/renewal notification to send before a package ends.",
    placeholders: ["Student Name", "Current Package End Date", "New Price", "Renewal Deadline"],
    content: `Subject: Ready for your next steps? Lesson Renewal Details

Hi [Student Name],

We have made fantastic progress over the last few weeks! Your current lesson package is scheduled to finish on **[Current Package End Date]**.

To secure your time slot for the upcoming cycle, we can renew with a new block:
- **Tuition Rate:** [New Price]
- **Renewal Deadline:** [Renewal Deadline]

Let me know if you'd like to stick to our current schedule or explore other options. Looking forward to continuing our journey!

Best,
Your Teacher`,
  },
  {
    id: "admin-cancellation",
    title: "Cancellation Response",
    category: "communication",
    section: "administrative",
    description: "Professional, warm response handling a student's cancellation.",
    placeholders: ["Student Name", "Last Class Date", "Notice Period Policy"],
    content: `Subject: Confirming Class Cancellation - [Student Name]

Hi [Student Name],

Thank you for letting me know. While I am sad to see you pause our lessons, I fully understand and support your decision.

As per our cancellation guidelines:
- **Notice Period:** [Notice Period Policy]
- **Final Class Date:** [Last Class Date]

It has been an absolute pleasure teaching you. I hope we can resume lessons in the future whenever you are ready!

Wishing you the very best,
Your Teacher`,
  },
  {
    id: "admin-follow-up",
    title: "Follow-up Template",
    category: "communication",
    section: "administrative",
    description: "Nurturing email template for leads who haven't booked yet.",
    placeholders: ["Lead Name", "Interests", "Trial Class Link"],
    content: `Subject: Level up your skills? Follow-up on your inquiry

Hi [Lead Name],

I wanted to check in to see if you have any questions about our specialized classes focusing on [Interests]. 

If you are ready to take the first step, you can book a complimentary placement consultation here:
- **Schedule Trial:** [Trial Class Link]

I would love to help you build a personalized study plan!

Best regards,
Your Teacher`,
  },
  // Business
  {
    id: "admin-policies",
    title: "School Policies",
    category: "business",
    section: "administrative",
    description: "General code of conduct and class booking guidelines.",
    placeholders: [
      "School Name",
      "Cancellation Notice Hours",
      "Late Arrival Window Mins",
      "Holidays Policy",
    ],
    content: `# [School Name] ACADEMIC POLICIES

Welcome! To ensure a professional and consistent learning environment, please review our terms:

### 1. Booking & Rescheduling
- Reschedules must be requested at least **[Cancellation Notice Hours] hours** in advance.
- Late cancellations count as completed.

### 2. Late Arrivals
- The Teacher will wait up to **[Late Arrival Window Mins] minutes** in the online classroom.
- If the Student does not arrive within this window, the lesson is marked as a no-show.

### 3. Holidays
- [Holidays Policy]`,
  },

  // PEDAGOGICAL RESOURCES
  // Placement
  {
    id: "ped-placement-test",
    title: "Placement Test Guidelines",
    category: "placement",
    section: "pedagogical",
    description: "Guidelines and scoring criteria for new student intake tests.",
    placeholders: [
      "Student Name",
      "Target Level",
      "Speaking Score",
      "Writing Score",
      "Recommended CEFR",
    ],
    content: `# INTAKE & PLACEMENT TEST SHEET

**Student Name:** [Student Name]  
**Target Level:** [Target Level]

---

### Evaluation Criteria:
1. **Speaking Proficiency:** [Speaking Score]/5
2. **Writing Proficiency:** [Writing Score]/5

### Placement recommendation:
- **CEFR level:** [Recommended CEFR]
- **Syllabus Focus:** (e.g. grammar consolidation, fluency practice)`,
  },
  {
    id: "ped-speaking-rubric",
    title: "Speaking Rubric",
    category: "placement",
    section: "pedagogical",
    description: "Intake evaluation card focusing strictly on spoken communication.",
    placeholders: [
      "Student Name",
      "Fluency Score 1-5",
      "Grammar Score 1-5",
      "Vocabulary Score 1-5",
      "Pronunciation Score 1-5",
    ],
    content: `# ORAL INTERVIEW EVALUATION SHEET

**Student:** [Student Name]

| Skill Component | Score (1-5) | Comments |
|---|---|---|
| **Fluency & Coherence** | [Fluency Score 1-5] | |
| **Lexical Resource** | [Vocabulary Score 1-5] | |
| **Grammatical Accuracy** | [Grammar Score 1-5] | |
| **Pronunciation** | [Pronunciation Score 1-5] | |

### General Assessment Notes:
- Fluency is prioritized over grammar errors.
- Target corrections focused on typical pronunciation patterns.`,
  },
  // Assessment
  {
    id: "ped-progress-report",
    title: "Progress Report",
    category: "assessment",
    section: "pedagogical",
    description: "Standard mid-term feedback form detailing strengths and goals.",
    placeholders: [
      "Student Name",
      "Evaluation Period",
      "Strengths",
      "Areas for Improvement",
      "Next Steps",
    ],
    content: `# STUDENT PROGRESS REPORT

**Student:** [Student Name]  
**Period:** [Evaluation Period]

---

### 1. Key Strengths
[Strengths]

### 2. Areas for Development
[Areas for Improvement]

### 3. Recommendations & Next Steps
[Next Steps]

Keep up the excellent dedication to your studies!`,
  },
  {
    id: "ped-semester-report",
    title: "Semester Report",
    category: "assessment",
    section: "pedagogical",
    description: "End of semester final evaluation format.",
    placeholders: [
      "Student Name",
      "Semester Year",
      "Attendance Rate",
      "Final Grade",
      "Overall Comments",
    ],
    content: `# ACADEMIC SEMESTER REVIEW

**Student:** [Student Name]  
**Semester:** [Semester Year]

- **Class Attendance Rate:** [Attendance Rate]
- **Final Level Score:** [Final Grade]

### Teacher's Assessment
[Overall Comments]

*Recommended next course tier: Consolidated*`,
  },
  // Student Records
  {
    id: "ped-student-goals",
    title: "Student Learning Goals",
    category: "records",
    section: "pedagogical",
    description: "Intake profile sheet tracking motivation and goals.",
    placeholders: ["Student Name", "Short-term Goal", "Long-term Goal", "Motivation Factor"],
    content: `# LEARNING TARGET SHEET

**Student:** [Student Name]

### 1. Short-Term Target (3 months)
- [Short-term Goal]

### 2. Long-Term Vision (1 year)
- [Long-term Goal]

### 3. Core Motivation
- [Motivation Factor] (e.g. job promotion, moving abroad)`,
  },
  // Planning
  {
    id: "ped-semester-planner",
    title: "Semester Planner",
    category: "planning",
    section: "pedagogical",
    description: "High-level syllabus framework template.",
    placeholders: ["Semester Year", "Course Book", "Number of Weeks", "Midterm Assessment Week"],
    content: `# COURSE PLANNER - [Semester Year]

**Core Book Reference:** [Course Book]  
**Duration:** [Number of Weeks] Weeks

- **Week 1-4:** Core Diagnostics & Grammar foundations.
- **Week [Midterm Assessment Week]:** Midterm oral and written assessments.
- **Final Weeks:** Practice presentations & consolidated review.`,
  },
  // Certificates
  {
    id: "ped-course-certificate",
    title: "Course Completion Certificate",
    category: "certificates",
    section: "pedagogical",
    description: "Standard certificate structure for course graduates.",
    placeholders: [
      "Student Name",
      "Course Title",
      "Total Hours",
      "Completion Date",
      "Teacher Name",
    ],
    content: `# CERTIFICATE OF COMPLETION

This certificate is proudly presented to:

### [Student Name]

for successfully completing the customized course:

### [Course Title]

Total completed hours: **[Total Hours] Hours**  
Graduation Date: **[Completion Date]**

Issued by: **[Teacher Name]**`,
  },
  {
    id: "ped-attendance-certificate",
    title: "Attendance Certificate",
    category: "certificates",
    section: "pedagogical",
    description: "Official confirmation of course attendance hours.",
    placeholders: [
      "Student Name",
      "Course Title",
      "Attendance Percentage",
      "Period",
      "Teacher Name",
    ],
    content: `# CERTIFICATE OF CLASS ATTENDANCE

This document certifies that:

### [Student Name]

has attended classes for:

### [Course Title]

with an overall attendance rate of **[Attendance Percentage]**  
during the period: **[Period]**

Teacher Signature: **[Teacher Name]**`,
  },
];

