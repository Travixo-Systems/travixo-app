import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Organization {
  name: string;
  address?: string;
  city?: string;
  postal_code?: string;
  siret?: string;
}

interface Inspection {
  id: string;
  inspection_date: string;
  inspector_name: string;
  inspector_company: string;
  certification_number: string | null;
  result: 'passed' | 'conditional' | 'failed';
  next_inspection_date: string;
  certificate_url: string | null;
  assets: {
    id: string;
    name: string;
    serial_number: string;
    asset_categories: {
      name: string;
    } | null;
  };
}

interface Summary {
  total_assets: number;
  total_inspections: number;
  passed: number;
  conditional: number;
  failed: number;
  compliance_rate: number;
  overdue_count: number;
}

interface ReportData {
  organization: Organization;
  period: {
    start_date: string; // ISO
    end_date: string; // ISO
  };
  inspections: Inspection[];
  summary: Summary;
  generated_at: string; // ISO
}

function formatDateFR(dateStr: string): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Single-brand, dates below header (like your original), no overlaps
export function generateVGPReport(data: ReportData): jsPDF {
  const { organization, period, inspections, summary, generated_at } = data;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  const blue = [15, 95, 166];
  const textPrimary = [33, 37, 41];
  const textMuted = [90, 90, 90];
  const borderGray = [210, 210, 210];

  let y = 18;

  // TITLE (center)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.text('RAPPORT DE CONFORMITÉ VGP', pageWidth / 2, y, { align: 'center' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('Vérifications Générales Périodiques', pageWidth / 2, y, { align: 'center' });

  // horizontal line
  y += 10;
  doc.setDrawColor(blue[0], blue[1], blue[2]);
  doc.setLineWidth(0.4);
  doc.line(10, y, pageWidth - 10, y);

  // now BELOW the line we put company + dates to avoid overlap
  y += 10;

  // company block (left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.text('ENTREPRISE :', 10, y);
  doc.setFont('helvetica', 'normal');
  doc.text(organization.name || 'N/A', 45, y);

  // dates block (left, like your version)
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('PÉRIODE DU RAPPORT :', 10, y);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Du ${formatDateFR(period.start_date)} au ${formatDateFR(period.end_date)}`,
    60,
    y
  );

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('DATE DE GÉNÉRATION :', 10, y);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDateFR(generated_at), 60, y);

  y += 10;

  // SUMMARY BOX
  const boxHeight = 36;
  doc.setDrawColor(blue[0], blue[1], blue[2]);
  doc.setFillColor(247, 249, 252);
  doc.rect(10, y, pageWidth - 20, boxHeight, 'F');
  doc.rect(10, y, pageWidth - 20, boxHeight, 'S');

  let boxY = y + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.text('RÉSUMÉ DE CONFORMITÉ', 14, boxY);

  boxY += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const col1X = 14;
  const col2X = pageWidth / 2 + 2;
  doc.text(`Équipements suivis VGP : ${summary.total_assets}`, col1X, boxY);
  doc.text(`Inspections réalisées : ${summary.total_inspections}`, col2X, boxY);

  boxY += 5;
  doc.text(`Conformes : ${summary.passed}`, col1X, boxY);
  doc.text(`Conditionnels : ${summary.conditional}`, col2X, boxY);

  boxY += 5;
  doc.text(`Non conformes : ${summary.failed}`, col1X, boxY);
  doc.text(`En retard : ${summary.overdue_count}`, col2X, boxY);

  boxY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Taux de conformité : ${summary.compliance_rate.toFixed(1)} %`,
    col1X,
    boxY
  );

  y += boxHeight + 12;

  // SECTION TITLE
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(textPrimary[0], textPrimary[1], textPrimary[2]);
  doc.text('DÉTAIL DES INSPECTIONS', 10, y);
  y += 5;

  const tableData = inspections.map((inspection) => {
    const resultText =
      inspection.result === 'passed'
        ? 'Conforme'
        : inspection.result === 'conditional'
        ? 'Conditionnel'
        : 'Non conforme';

    return [
      formatDateFR(inspection.inspection_date),
      inspection.assets?.name || 'N/A',
      inspection.assets?.serial_number || 'N/A',
      inspection.assets?.asset_categories?.name || 'N/A',
      inspection.inspector_name || 'N/A',
      inspection.inspector_company || 'N/A',
      inspection.certification_number || 'N/A',
      resultText,
      formatDateFR(inspection.next_inspection_date),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [[
      'Date',
      'Équipement',
      'N° Série',
      'Catégorie',
      'Inspecteur',
      'Organisme',
      'N° Certif.',
      'Résultat',
      'Prochaine',
    ]],
    body: tableData,
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: borderGray,
      lineWidth: 0.1,
      textColor: textPrimary,
    },
    headStyles: {
      fillColor: blue,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 28 },
      2: { cellWidth: 18 },
      3: { cellWidth: 20 },
      4: { cellWidth: 22 },
      5: { cellWidth: 22 },
      6: { cellWidth: 20 },
      7: { cellWidth: 20 },
      8: { cellWidth: 20 },
    },margin: { top: 10, right: 10, bottom: 28, left: 10 },
    didDrawPage: (data) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;

      // footer
      doc.setFontSize(8);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      doc.text(
        `Page ${currentPage} / ${pageCount}`,
        pageWidth - 20,
        pageHeight - 12,
        { align: 'right' }
      );

      doc.text(
        `Généré par TraviXO • ${formatDateFR(generated_at)}`,
        20,
        pageHeight - 12
      );

      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(
        "Document destiné aux contrôles VGP conformément au Code du travail.",
        pageWidth / 2,
        pageHeight - 5,
        { align: 'center' }
      );
    },
  });

  return doc;
}