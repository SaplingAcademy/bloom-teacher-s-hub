import { StudentLesson } from "./lesson-plan-sync";

interface PDFExportOptions {
  title?: string;
  studentName: string;
  level?: string;
  focus?: string;
  totalPackageLessons?: number;
  lessons: StudentLesson[];
}

/**
 * Sanitizes a string to be safely used in filenames
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generates a clean, professional PDF document for Lesson Plans
 * without web inputs, controls, sidebars, or interactive elements.
 */
export function exportLessonPlanPDF({
  title = "Plano de Aulas e Progresso",
  studentName,
  level = "B2",
  focus = "General English",
  totalPackageLessons,
  lessons,
}: PDFExportOptions) {
  const completedCount = lessons.filter((l) => l.completed).length;
  const totalCount = totalPackageLessons || lessons.length || 1;
  const progressPct = Math.round((completedCount / totalCount) * 100);
  const formattedToday = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const sanitized = sanitizeFilename(studentName) || "aluno";
  const filename = `plano-de-aulas-${sanitized}.pdf`;

  // Create printable HTML stream for standard PDF generation
  const rowsHtml = lessons
    .map((l) => {
      const isDone = l.completed;
      const hwVal = (l as any).homework_posted;
      const hwText = hwVal === true ? "Entregue" : hwVal === false ? "Pendente" : "—";
      const hwClass = hwVal === true ? "hw-posted" : hwVal === false ? "hw-pending" : "hw-unrecorded";
      const statusText = isDone ? "✓ Concluída" : "Pendente";
      const attText = l.attendance_status || "—";
      const formattedDate = l.scheduled_date
        ? l.scheduled_date.split("-").reverse().join("/")
        : "—";
      const formattedTime = l.start_time ? l.start_time.slice(0, 5) : "—";

      const notesContent = l.notes || "";
      const atts = ((l as any).attachments || []) as any[];
      let combinedNotesHtml = escapeHtml(notesContent || "—");

      if (atts.length > 0) {
        const attListHtml = atts
          .map((a) => {
            const title = a.title || a.file_name || (a.type === "file" ? "Arquivo PDF" : "Link externo");
            return `• ${escapeHtml(title)}`;
          })
          .join("<br/>");
        
        combinedNotesHtml = notesContent
          ? `${escapeHtml(notesContent)}<div style="margin-top:4px; font-size:9.5px; color:#1e293b; font-weight:600;">Anexos:<br/>${attListHtml}</div>`
          : `<div style="font-size:9.5px; color:#1e293b; font-weight:600;">Anexos:<br/>${attListHtml}</div>`;
      }

      return `
        <tr class="${isDone ? "completed-row" : ""}">
          <td class="col-num font-bold">L${l.lesson_number}</td>
          <td class="col-date">${formattedDate}</td>
          <td class="col-time">${formattedTime}</td>
          <td class="col-topic">${escapeHtml(l.content || "—")}</td>
          <td class="col-hw ${hwClass}">${hwText}</td>
          <td class="col-att">${escapeHtml(attText)}</td>
          <td class="col-notes">${combinedNotesHtml}</td>
          <td class="col-status ${isDone ? "status-done" : "status-pending"}">${statusText}</td>
        </tr>
      `;
    })
    .join("");

  const printDocumentHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(filename)}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm 15mm 15mm;
        }

        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1a1a1a;
          background: #ffffff;
          margin: 0;
          padding: 0;
          font-size: 11px;
          line-height: 1.4;
        }

        /* HEADER BRAND BANNER */
        .pdf-header {
          background-color: #163020;
          color: #ffffff;
          padding: 20px 24px;
          border-radius: 12px;
          margin-bottom: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pdf-header-title {
          font-size: 20px;
          font-weight: 800;
          margin: 0 0 4px 0;
          letter-spacing: -0.3px;
        }

        .pdf-header-subtitle {
          font-size: 11px;
          color: #a3b899;
          margin: 0;
          font-weight: 500;
        }

        .pdf-brand-logo {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 1px;
          color: #ffffff;
          text-align: right;
        }

        /* METADATA GRID */
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          background-color: #f7f9f6;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 14px 18px;
          margin-bottom: 22px;
        }

        .meta-item {
          display: flex;
          flex-direction: column;
        }

        .meta-label {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          color: #64748b;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .meta-val {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
        }

        /* TABLE */
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }

        thead {
          display: table-header-group;
        }

        tr {
          page-break-inside: avoid;
        }

        th {
          background-color: #163020;
          color: #ffffff;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 10px 10px;
          text-align: left;
          border-right: 1px solid rgba(255, 255, 255, 0.15);
        }

        th:last-child {
          border-right: none;
        }

        td {
          padding: 9px 10px;
          font-size: 10.5px;
          border-bottom: 1px solid #e2e8f0;
          border-right: 1px solid #f1f5f9;
          vertical-align: top;
        }

        td:last-child {
          border-right: none;
        }

        .col-num { width: 36px; text-align: center; background-color: #f8fafc; font-weight: 700; }
        .col-date { width: 85px; font-family: monospace; font-size: 10px; }
        .col-time { width: 55px; font-family: monospace; font-size: 10px; }
        .col-topic { width: auto; font-weight: 500; }
        .col-hw { width: 80px; font-weight: 600; text-align: center; }
        .col-att { width: 85px; }
        .col-notes { width: auto; color: #475569; font-size: 10px; }
        .col-status { width: 90px; font-weight: 700; text-align: center; }

        /* STATUS BADGES & STYLES */
        .completed-row {
          background-color: #f8fafc;
          color: #64748b;
        }

        .status-done {
          color: #15803d;
        }

        .status-pending {
          color: #b45309;
        }

        .hw-posted {
          color: #15803d;
        }

        .hw-pending {
          color: #d97706;
        }

        /* FOOTER */
        .pdf-footer {
          margin-top: 30px;
          padding-top: 12px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9px;
          color: #94a3b8;
        }
      </style>
    </head>
    <body>
      <!-- HEADER BANNER -->
      <div class="pdf-header">
        <div>
          <h1 class="pdf-header-title">${escapeHtml(title)}</h1>
          <p class="pdf-header-subtitle">Bloom Teacher's Hub • Relatório Oficial de Acompanhamento</p>
        </div>
        <div class="pdf-brand-logo">
          BLOOM
        </div>
      </div>

      <!-- METADATA GRID -->
      <div class="meta-grid">
        <div class="meta-item">
          <span class="meta-label">Aluno / Turma</span>
          <span class="meta-val">${escapeHtml(studentName)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Nível & Foco</span>
          <span class="meta-val">${escapeHtml(level)} • ${escapeHtml(focus)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Progresso do Curso</span>
          <span class="meta-val">${completedCount} / ${totalCount} aulas (${progressPct}%)</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Data de Emissão</span>
          <span class="meta-val">${formattedToday}</span>
        </div>
      </div>

      <!-- LESSONS TABLE -->
      <table>
        <thead>
          <tr>
            <th style="width:36px; text-align:center;">#</th>
            <th style="width:85px;">Data</th>
            <th style="width:55px;">Horário</th>
            <th>Conteúdo / Tópico</th>
            <th style="width:80px; text-align:center;">Tarefa</th>
            <th style="width:85px;">Presença</th>
            <th>Observações</th>
            <th style="width:90px; text-align:center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- FOOTER -->
      <div class="pdf-footer">
        <span>Gerado em ${formattedToday} • Bloom Teacher's Hub</span>
        <span>Página 1 de 1</span>
      </div>

      <script>
        window.onload = function() {
          document.title = "${escapeHtml(filename)}";
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  // Open print stream window
  const printWin = window.open("", "_blank");
  if (printWin) {
    printWin.document.open();
    printWin.document.write(printDocumentHtml);
    printWin.document.close();
  }
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
