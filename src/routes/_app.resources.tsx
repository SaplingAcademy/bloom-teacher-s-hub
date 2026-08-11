import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "sonner";
import {
  FileText,
  Wallet,
  Megaphone,
  Briefcase,
  Target,
  GraduationCap,
  UserCheck,
  Compass,
  Award,
  Search,
  Star,
  History,
  Plus,
  Trash2,
  Eye,
  Copy,
  Download,
  Send,
  Link2,
  ArrowLeft,
  ChevronRight,
  FileSpreadsheet,
  Check,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { PanelCard } from "@/components/bloom/PanelCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/resources")({
  head: () => ({
    meta: [
      { title: "Resources · Bloom" },
      { name: "description", content: "Bloom's administrative and pedagogical business toolkit." },
    ],
  }),
  component: ResourcesPage,
});

interface ResourceTemplate {
  id: string;
  title: string;
  category: string; // "contracts" | "finance" | "communication" | "business" | "placement" | "assessment" | "records" | "planning" | "certificates"
  section: "administrative" | "pedagogical";
  description: string;
  placeholders: string[]; // e.g. ["Student Name", "Price"]
  content: string; // The markdown template content
}

const TEMPLATES: ResourceTemplate[] = [
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
    content: `Subject: Welcome to [Course Name]! 🌟

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

const TRANSLATIONS = {
  en: {
    title: "Resources & Templates",
    subtitle: "Bloom's administrative and pedagogical business toolkit.",
    searchPlaceholder: "Search contracts, policies, evaluations...",
    quickActions: "Quick Actions",
    adminTitle: "Administrative Resources",
    adminSubtitle: "Contracts, billing, client communications, and policies.",
    pedagogicalTitle: "Pedagogical Resources",
    pedagogicalSubtitle: "Placement, student goals, planners, and course reports.",
    recentTitle: "Recently Used",
    favoritesTitle: "Favorites",
    noRecent: "No recently used templates yet.",
    noFavorites: "Mark templates as favorites for quick access.",
    useTemplate: "Use Template",
    preview: "Preview",
    duplicate: "Duplicate",
    favorite: "Favorite",
    unfavorite: "Unfavorite",
    backToDashboard: "Back to Resources",
    categoryTemplates: "templates",
    exportPdf: "Export PDF",
    sendStudent: "Send to Student",
    attachProfile: "Attach to Profile",
    copiedToast: "Template copied to clipboard!",
    duplicateToast: "Template duplicated successfully!",
    fillPlaceholders: "Fill Placeholders",
    documentPreview: "Document Preview",
    soon: "Soon",
    close: "Close",
    newContract: "New Contract",
    newPlacement: "New Placement Test",
    newReport: "New Progress Report",
    newCertificate: "New Certificate",
    contracts: "Contracts",
    finance: "Finance",
    communication: "Communication",
    business: "Business Policies",
    placement: "Placement",
    assessment: "Assessment",
    records: "Student Records",
    planning: "Planning",
    certificates: "Certificates",
    cancel: "Cancel",
    save: "Save",
    copy: "Copy Document",
  },
  pt: {
    title: "Recursos e Modelos",
    subtitle: "Kit de ferramentas administrativas e pedagógicas do Bloom.",
    searchPlaceholder: "Buscar contratos, políticas, avaliações...",
    quickActions: "Ações Rápidas",
    adminTitle: "Recursos Administrativos",
    adminSubtitle: "Contratos, cobrança, comunicados e políticas comerciais.",
    pedagogicalTitle: "Recursos Pedagógicos",
    pedagogicalSubtitle: "Nivelamento, objetivos dos alunos, cronogramas e relatórios.",
    recentTitle: "Usados Recentemente",
    favoritesTitle: "Favoritos",
    noRecent: "Nenhum modelo usado recentemente.",
    noFavorites: "Marque modelos como favoritos para acesso rápido.",
    useTemplate: "Usar Modelo",
    preview: "Visualizar",
    duplicate: "Duplicar",
    favorite: "Favoritar",
    unfavorite: "Desfavoritar",
    backToDashboard: "Voltar para Recursos",
    categoryTemplates: "modelos",
    exportPdf: "Exportar PDF",
    sendStudent: "Enviar ao Aluno",
    attachProfile: "Anexar ao Perfil",
    copiedToast: "Modelo copiado para a área de transferência!",
    duplicateToast: "Modelo duplicado com sucesso!",
    fillPlaceholders: "Preencher Campos",
    documentPreview: "Pré-visualização do Documento",
    soon: "Em breve",
    close: "Fechar",
    newContract: "Novo Contrato",
    newPlacement: "Novo Teste de Nivelamento",
    newReport: "Novo Relatório de Progresso",
    newCertificate: "Novo Certificado",
    contracts: "Contratos",
    finance: "Finanças",
    communication: "Comunicação",
    business: "Políticas Comerciais",
    placement: "Nivelamento",
    assessment: "Avaliação",
    records: "Fichas de Aluno",
    planning: "Planejamento",
    certificates: "Certificados",
    cancel: "Cancelar",
    save: "Salvar",
    copy: "Copiar Documento",
  },
};

function ResourcesPage() {
  const { lang } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // States for dynamic additions
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentOpened, setRecentOpened] = useState<string[]>([]);
  const [customTemplates, setCustomTemplates] = useState<ResourceTemplate[]>([]);

  // Modals state
  const [previewTemplate, setPreviewTemplate] = useState<ResourceTemplate | null>(null);
  const [builderTemplate, setBuilderTemplate] = useState<ResourceTemplate | null>(null);
  const [builderForm, setBuilderForm] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load states
    const savedFavorites = localStorage.getItem("bloom.resources.favorites");
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));

    const savedRecent = localStorage.getItem("bloom.resources.recent");
    if (savedRecent) setRecentOpened(JSON.parse(savedRecent));

    const savedCustom = localStorage.getItem("bloom.resources.custom");
    if (savedCustom) setCustomTemplates(JSON.parse(savedCustom));
  }, []);

  const t = TRANSLATIONS[lang];

  // Helper to persist Favorites
  const toggleFavorite = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const newFavorites = favorites.includes(id)
      ? favorites.filter((favId) => favId !== id)
      : [...favorites, id];
    setFavorites(newFavorites);
    localStorage.setItem("bloom.resources.favorites", JSON.stringify(newFavorites));
  };

  // Helper to persist Recently Used
  const recordRecentOpened = (id: string) => {
    const updated = [id, ...recentOpened.filter((item) => item !== id)].slice(0, 5);
    setRecentOpened(updated);
    localStorage.setItem("bloom.resources.recent", JSON.stringify(updated));
  };

  // Helper to duplicate template
  const handleDuplicateTemplate = (template: ResourceTemplate, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const newId = `${template.id}-copy-${Date.now()}`;
    const duplicated: ResourceTemplate = {
      ...template,
      id: newId,
      title: `${template.title} (${lang === "pt" ? "Cópia" : "Copy"})`,
    };
    const updatedCustom = [...customTemplates, duplicated];
    setCustomTemplates(updatedCustom);
    localStorage.setItem("bloom.resources.custom", JSON.stringify(updatedCustom));
    toast.success(t.duplicateToast);
  };

  // Trigger template builder modal
  const handleUseTemplate = (template: ResourceTemplate, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setPreviewTemplate(null);
    setBuilderTemplate(template);
    recordRecentOpened(template.id);

    // Initialize placeholders
    const initialForm: Record<string, string> = {};
    template.placeholders.forEach((p) => {
      initialForm[p] = "";
    });
    setBuilderForm(initialForm);
  };

  const handleOpenPreview = (template: ResourceTemplate) => {
    setPreviewTemplate(template);
    recordRecentOpened(template.id);
  };

  // Combine static and custom user templates
  const allTemplates = [...TEMPLATES, ...customTemplates];

  // Helper to search and filter templates
  const filteredTemplates = allTemplates.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (selectedCategory) {
      return item.category === selectedCategory && matchesSearch;
    }
    return matchesSearch;
  });

  // Category counts
  const getCategoryCount = (cat: string) => {
    return allTemplates.filter((t) => t.category === cat).length;
  };

  // Render template content replacing placeholders
  const getRenderedContent = () => {
    if (!builderTemplate) return "";
    let content = builderTemplate.content;
    Object.entries(builderForm).forEach(([key, val]) => {
      const placeholder = `[${key}]`;
      const replacement = val.trim() !== "" ? val : placeholder;
      content = content.replaceAll(placeholder, replacement);
    });
    return content;
  };

  const copyToClipboard = () => {
    const rendered = getRenderedContent();
    navigator.clipboard.writeText(rendered);
    toast.success(t.copiedToast);
  };

  // Get matching category display name & icon
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case "contracts":
        return {
          label: t.contracts,
          icon: FileText,
          color: "text-primary bg-primary-soft border-primary/20",
        };
      case "finance":
        return {
          label: t.finance,
          icon: Wallet,
          color: "text-warning bg-warning/15 border-warning/20",
        };
      case "communication":
        return {
          label: t.communication,
          icon: Megaphone,
          color: "text-lilac bg-lilac-soft border-lilac/20",
        };
      case "business":
        return {
          label: t.business,
          icon: Briefcase,
          color: "text-accent bg-accent/15 border-accent/20",
        };
      case "placement":
        return {
          label: t.placement,
          icon: Target,
          color: "text-primary bg-primary-soft border-primary/20",
        };
      case "assessment":
        return {
          label: t.assessment,
          icon: GraduationCap,
          color: "text-lilac bg-lilac-soft border-lilac/20",
        };
      case "records":
        return {
          label: t.records,
          icon: UserCheck,
          color: "text-warning bg-warning/15 border-warning/20",
        };
      case "planning":
        return {
          label: t.planning,
          icon: Compass,
          color: "text-accent bg-accent/15 border-accent/20",
        };
      case "certificates":
        return {
          label: t.certificates,
          icon: Award,
          color: "text-primary bg-primary-soft border-primary/20",
        };
      default:
        return {
          label: cat,
          icon: FileText,
          color: "text-muted-foreground bg-muted border-border/20",
        };
    }
  };

  return (
    <div className="space-y-7">
      {/* Page Header */}
      <PageHeader
        eyebrow={lang === "pt" ? "Kit de Ferramentas" : "Business Toolkit"}
        title={t.title}
        description={t.subtitle}
        actions={
          <div className="relative w-64 md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-sm transition-all"
            />
          </div>
        }
      />

      {selectedCategory ? (
        /* CATEGORY DETAILED VIEW */
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedCategory(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.backToDashboard}
            </button>
            <h2 className="text-xl font-bold font-display text-foreground capitalize">
              {getCategoryMeta(selectedCategory).label}
            </h2>
            <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5 rounded-full">
              {filteredTemplates.length} {t.categoryTemplates}
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filteredTemplates.map((template) => {
              const isFav = favorites.includes(template.id);
              const catMeta = getCategoryMeta(template.category);
              return (
                <PanelCard
                  key={template.id}
                  title={template.title}
                  description={template.description}
                  icon={<catMeta.icon className="h-4 w-4" />}
                  className="hover:shadow-md transition-shadow relative"
                  contentClassName="p-5 flex flex-col justify-between min-h-[140px]"
                >
                  <div className="flex-1" />
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/40">
                    <button
                      onClick={(e) => toggleFavorite(template.id, e)}
                      className={`p-1.5 rounded-lg border transition-colors hover:bg-secondary cursor-pointer ${
                        isFav
                          ? "text-amber-500 border-amber-200 bg-amber-500/5"
                          : "text-muted-foreground border-border"
                      }`}
                      title={isFav ? t.unfavorite : t.favorite}
                    >
                      <Star className={`h-4 w-4 ${isFav ? "fill-amber-500" : ""}`} />
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenPreview(template)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t.preview}
                      </button>
                      <button
                        onClick={(e) => handleUseTemplate(template, e)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        {t.useTemplate}
                      </button>
                    </div>
                  </div>
                </PanelCard>
              );
            })}
          </div>
        </div>
      ) : (
        /* MAIN DASHBOARD */
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* SECTION 1: QUICK ACTIONS */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {t.quickActions}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <button
                onClick={(e) => {
                  const temp = allTemplates.find((x) => x.id === "admin-student-contract");
                  if (temp) handleUseTemplate(temp, e);
                }}
                className="flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/45 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="rounded-xl bg-primary-soft p-2.5 text-primary border border-primary/10">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-sm group-hover:text-primary transition-colors">
                    {t.newContract}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {lang === "pt"
                      ? "Criar contrato de prestação de aulas"
                      : "Draft student agreement policies"}
                  </p>
                </div>
              </button>

              <button
                onClick={(e) => {
                  const temp = allTemplates.find((x) => x.id === "ped-placement-test");
                  if (temp) handleUseTemplate(temp, e);
                }}
                className="flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/45 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="rounded-xl bg-warning/10 p-2.5 text-warning border border-warning/10">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-sm group-hover:text-warning transition-colors">
                    {t.newPlacement}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {lang === "pt"
                      ? "Iniciar teste de nivelamento"
                      : "Begin onboarding oral interview"}
                  </p>
                </div>
              </button>

              <button
                onClick={(e) => {
                  const temp = allTemplates.find((x) => x.id === "ped-progress-report");
                  if (temp) handleUseTemplate(temp, e);
                }}
                className="flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/45 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="rounded-xl bg-lilac-soft p-2.5 text-lilac border border-lilac/10">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-sm group-hover:text-lilac transition-colors">
                    {t.newReport}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {lang === "pt"
                      ? "Criar relatório de desempenho"
                      : "Generate mid-term student reviews"}
                  </p>
                </div>
              </button>

              <button
                onClick={(e) => {
                  const temp = allTemplates.find((x) => x.id === "ped-course-certificate");
                  if (temp) handleUseTemplate(temp, e);
                }}
                className="flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/45 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="rounded-xl bg-accent/15 p-2.5 text-accent border border-accent/10">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-sm group-hover:text-accent transition-colors">
                    {t.newCertificate}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {lang === "pt"
                      ? "Emitir certificado de conclusão"
                      : "Award certificate of achievement"}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* SECTION 2: ADMINISTRATIVE RESOURCES */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t.adminTitle}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t.adminSubtitle}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  id: "contracts",
                  label: t.contracts,
                  icon: FileText,
                  color: "from-emerald-500/10 to-teal-500/10 hover:border-emerald-500/30",
                },
                {
                  id: "finance",
                  label: t.finance,
                  icon: Wallet,
                  color: "from-amber-500/10 to-orange-500/10 hover:border-amber-500/30",
                },
                {
                  id: "communication",
                  label: t.communication,
                  icon: Megaphone,
                  color: "from-indigo-500/10 to-purple-500/10 hover:border-indigo-500/30",
                },
                {
                  id: "business",
                  label: t.business,
                  icon: Briefcase,
                  color: "from-pink-500/10 to-rose-500/10 hover:border-pink-500/30",
                },
              ].map((cat) => {
                const count = getCategoryCount(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center justify-between p-5 rounded-2xl border border-border bg-card hover:shadow-sm transition-all text-left cursor-pointer ${cat.color}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-secondary p-2.5 text-foreground border border-border/55">
                        <cat.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-foreground text-sm">
                          {cat.label}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {count} {t.categoryTemplates}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: PEDAGOGICAL RESOURCES */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t.pedagogicalTitle}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t.pedagogicalSubtitle}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  id: "placement",
                  label: t.placement,
                  icon: Target,
                  color: "from-sky-500/10 to-blue-500/10 hover:border-sky-500/30",
                },
                {
                  id: "assessment",
                  label: t.assessment,
                  icon: GraduationCap,
                  color: "from-violet-500/10 to-fuchsia-500/10 hover:border-violet-500/30",
                },
                {
                  id: "records",
                  label: t.records,
                  icon: UserCheck,
                  color: "from-yellow-500/10 to-amber-500/10 hover:border-yellow-500/30",
                },
                {
                  id: "planning",
                  label: t.planning,
                  icon: Compass,
                  color: "from-teal-500/10 to-cyan-500/10 hover:border-teal-500/30",
                },
                {
                  id: "certificates",
                  label: t.certificates,
                  icon: Award,
                  color: "from-red-500/10 to-orange-500/10 hover:border-red-500/30",
                },
              ].map((cat) => {
                const count = getCategoryCount(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex flex-col justify-between p-5 rounded-2xl border border-border bg-card hover:shadow-sm transition-all text-left cursor-pointer min-h-[120px] ${cat.color}`}
                  >
                    <div className="rounded-xl bg-secondary p-2.5 text-foreground border border-border/55 w-fit">
                      <cat.icon className="h-4 w-4" />
                    </div>
                    <div className="mt-3">
                      <h3 className="font-display font-bold text-foreground text-sm truncate">
                        {cat.label}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {count} {t.categoryTemplates}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: RECENTLY USED & FAVORITES */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Favorites Column */}
            <PanelCard
              title={t.favoritesTitle}
              icon={<Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
              contentClassName="p-4 space-y-2.5"
            >
              {favorites.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">{t.noFavorites}</p>
              ) : (
                favorites.map((favId) => {
                  const template = allTemplates.find((x) => x.id === favId);
                  if (!template) return null;
                  const catMeta = getCategoryMeta(template.category);
                  return (
                    <div
                      key={template.id}
                      onClick={() => handleOpenPreview(template)}
                      className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20 hover:bg-secondary/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <catMeta.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold text-foreground truncate">
                          {template.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleUseTemplate(template, e)}
                          className="p-1 text-primary hover:bg-primary-soft rounded transition-colors cursor-pointer"
                          title={t.useTemplate}
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => toggleFavorite(template.id, e)}
                          className="p-1 text-amber-500 hover:bg-secondary rounded transition-colors cursor-pointer"
                          title={t.unfavorite}
                        >
                          <Star className="h-3.5 w-3.5 fill-amber-500" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </PanelCard>

            {/* Recently Used Column */}
            <PanelCard
              title={t.recentTitle}
              icon={<History className="h-4 w-4 text-muted-foreground" />}
              contentClassName="p-4 space-y-2.5"
            >
              {recentOpened.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">{t.noRecent}</p>
              ) : (
                recentOpened.map((recId) => {
                  const template = allTemplates.find((x) => x.id === recId);
                  if (!template) return null;
                  const catMeta = getCategoryMeta(template.category);
                  const isFav = favorites.includes(template.id);
                  return (
                    <div
                      key={template.id}
                      onClick={() => handleOpenPreview(template)}
                      className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20 hover:bg-secondary/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <catMeta.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold text-foreground truncate">
                          {template.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleUseTemplate(template, e)}
                          className="p-1 text-primary hover:bg-primary-soft rounded transition-colors cursor-pointer"
                          title={t.useTemplate}
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => toggleFavorite(template.id, e)}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            isFav ? "text-amber-500" : "text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          <Star className={`h-3.5 w-3.5 ${isFav ? "fill-amber-500" : ""}`} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </PanelCard>
          </div>
        </div>
      )}

      {/* TEMPLATE PREVIEW MODAL */}
      <Dialog
        open={previewTemplate !== null}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      >
        <DialogContent className="max-w-xl rounded-2xl p-6">
          {previewTemplate && (
            <>
              <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-border">
                <div>
                  <DialogTitle className="font-display text-lg font-bold text-foreground">
                    {previewTemplate.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {getCategoryMeta(previewTemplate.category).label} ·{" "}
                    {previewTemplate.section === "administrative"
                      ? t.adminTitle
                      : t.pedagogicalTitle}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <div className="py-4">
                <p className="text-xs text-muted-foreground mb-3 font-medium bg-secondary/80 px-3 py-2 rounded-xl border border-border/50">
                  {previewTemplate.description}
                </p>
                <div className="rounded-xl border border-border/80 p-4 bg-muted/15 max-h-[300px] overflow-y-auto font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-foreground select-all">
                  {previewTemplate.content}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <button
                  onClick={(e) => handleDuplicateTemplate(previewTemplate, e)}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t.duplicate}
                </button>

                <div className="flex items-center gap-2">
                  <DialogClose asChild>
                    <button className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer">
                      {t.close}
                    </button>
                  </DialogClose>
                  <button
                    onClick={(e) => handleUseTemplate(previewTemplate, e)}
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    {t.useTemplate}
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* INTERACTIVE BUILDER / USE TEMPLATE MODAL */}
      <Dialog
        open={builderTemplate !== null}
        onOpenChange={(open) => !open && setBuilderTemplate(null)}
      >
        <DialogContent className="max-w-4xl rounded-2xl p-6 lg:max-h-[90vh] lg:overflow-y-auto">
          {builderTemplate && (
            <>
              <DialogHeader className="pb-3 border-b border-border">
                <DialogTitle className="font-display text-lg font-bold text-foreground">
                  {t.useTemplate}: {builderTemplate.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {lang === "pt"
                    ? "Preencha os campos abaixo para gerar o documento personalizado."
                    : "Fill in the placeholders below to generate your personalized document."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr] py-4">
                {/* Form Controls Column */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/60">
                    {t.fillPlaceholders}
                  </h3>
                  <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                    {builderTemplate.placeholders.map((p) => (
                      <div key={p} className="space-y-1">
                        <Label
                          htmlFor={`placeholder-${p}`}
                          className="text-xs font-semibold text-foreground"
                        >
                          {p}
                        </Label>
                        <Input
                          id={`placeholder-${p}`}
                          value={builderForm[p] || ""}
                          onChange={(e) =>
                            setBuilderForm((prev) => ({
                              ...prev,
                              [p]: e.target.value,
                            }))
                          }
                          placeholder={`e.g. [${p}]`}
                          className="h-9 rounded-xl text-xs bg-card"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Preview Column */}
                <div className="space-y-3 flex flex-col">
                  <div className="flex items-center justify-between pb-1 border-b border-border/60">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t.documentPreview}
                    </h3>
                    <button
                      onClick={copyToClipboard}
                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary/10 border border-primary/20 px-2 text-[11px] font-semibold text-primary transition-all hover:bg-primary-soft cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      {t.copy}
                    </button>
                  </div>

                  {/* Generated Document Content Preview */}
                  <div className="flex-1 rounded-xl border border-border bg-card p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground select-all max-h-[350px] overflow-y-auto shadow-inner">
                    {getRenderedContent()}
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border mt-2">
                {/* Future Roadmap Actions - Styled but disabled */}
                <div className="flex items-center gap-2">
                  <button
                    disabled
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-65"
                    title={`${t.exportPdf} (${t.soon})`}
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t.exportPdf}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 px-1 border-border/80 ml-1 rounded"
                    >
                      {t.soon}
                    </Badge>
                  </button>

                  <button
                    disabled
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-65"
                    title={`${t.sendStudent} (${t.soon})`}
                  >
                    <Send className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t.sendStudent}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 px-1 border-border/80 ml-1 rounded"
                    >
                      {t.soon}
                    </Badge>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <DialogClose asChild>
                    <button className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer">
                      {t.close}
                    </button>
                  </DialogClose>
                  <button
                    onClick={copyToClipboard}
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t.copy}
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
