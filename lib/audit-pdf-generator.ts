import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * AUDIT INVENTORY COMPLETION PDF REPORT GENERATOR
 * Generates a PDF report for inventory audit completion/progress.
 *
 * Follows the same encoding and formatting conventions as the VGP DIRECCTE
 * report generator (pdf-generator.ts).
 */

interface AuditReportData {
  audit: {
    name: string
    status: string
    scheduled_date: string | null
    started_at: string | null
    completed_at: string | null
    total_assets: number
    verified_assets: number
    missing_assets: number
  }
  organization: { name: string }
  items: Array<{
    asset_name: string
    serial_number: string | null
    category: string | null
    location: string | null
    status: string  // 'verified' | 'missing' | 'pending' | 'excluded'
    verified_at: string | null
    notes: string | null  // exclusion reason for excluded items
  }>
}

/**
 * Clean text for PDF compatibility - removes problematic characters
 */
function cleanTextForPDF(text: string): string {
  if (!text) return '';

  // Replace French accents with safe alternatives
  return text
    .replace(/[éèêë]/g, 'e')
    .replace(/[àâä]/g, 'a')
    .replace(/[îï]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÀÂÄ]/g, 'A')
    .replace(/[ÎÏ]/g, 'I')
    .replace(/[ÔÖ]/g, 'O')
    .replace(/[ÙÛÜ]/g, 'U')
    .replace(/Ç/g, 'C')
    // Remove other problematic characters
    .replace(/[^\x00-\x7F]/g, '?')  // Replace non-ASCII with ?
    .trim();
}

/**
 * Safe text helper - ensures all text is PDF-compatible
 */
function safeText(text: string): string {
  return cleanTextForPDF(text);
}

/**
 * Format date to French format (DD/MM/YYYY) - safe version
 */
function formatDate(dateString: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Format a datetime string to French format (DD/MM/YYYY HH:MM)
 */
function formatDateTime(dateString: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Calculate duration between two date strings.
 * Returns a human-readable French string (e.g. "2h 34min").
 */
function calculateDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return 'N/A';

  const start = new Date(startedAt);
  const end = new Date(completedAt);
  const diffMs = end.getTime() - start.getTime();

  if (diffMs < 0) return 'N/A';

  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  return `${minutes}min`;
}

export function generateAuditReport(data: AuditReportData): Buffer {
  const { audit, organization, items } = data;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  // Set encoding explicitly
  doc.setLanguage('fr');

  // ============================================================================
  // DETERMINE AUDIT STATE
  // ============================================================================
  const isInProgress = audit.status !== 'completed';
  const excludedItems = items.filter(i => i.status === 'excluded');
  const missingItems = items.filter(i => i.status === 'missing');
  const verifiedItems = items.filter(i => i.status === 'verified');
  const pendingItems = items.filter(i => i.status === 'pending');

  const excludedCount = excludedItems.length;
  const completionRate = audit.total_assets > 0
    ? Math.round((audit.verified_assets / audit.total_assets) * 100 * 10) / 10
    : 0;

  // ============================================================================
  // IN-PROGRESS WATERMARK / BANNER
  // ============================================================================
  if (isInProgress) {
    // Diagonal watermark text across the page
    doc.setFontSize(54);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 53, 69);
    doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
    doc.text('AUDIT EN COURS', 105, 160, { align: 'center', angle: 45 });
    doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

    // Top banner
    doc.setFillColor(220, 53, 69);
    doc.rect(0, 0, 210, 8, 'F');
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('AUDIT EN COURS - RAPPORT PROVISOIRE', 105, 5.5, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }

  // ============================================================================
  // PAGE HEADER
  // ============================================================================
  const headerStartY = isInProgress ? 18 : 10;

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(safeText('RAPPORT D\'AUDIT D\'INVENTAIRE'), 105, headerStartY + 10, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(organization.name), 105, headerStartY + 18, { align: 'center' });

  doc.setFontSize(10);
  doc.text(
    safeText(`Date du rapport: ${formatDate(new Date().toISOString().split('T')[0])}`),
    105,
    headerStartY + 24,
    { align: 'center' }
  );

  // ============================================================================
  // SUMMARY SECTION
  // ============================================================================
  const summaryY = headerStartY + 34;

  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 249, 250);
  doc.rect(20, summaryY, 170, 40, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(safeText('INFORMATIONS DE L\'AUDIT'), 25, summaryY + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const statusText = isInProgress ? 'En cours' : 'Termine';

  // Left column
  const leftX = 25;
  let currentY = summaryY + 14;
  doc.setFont('helvetica', 'bold');
  doc.text('Nom:', leftX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(audit.name), leftX + 25, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Date prevue:', leftX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(audit.scheduled_date ? formatDate(audit.scheduled_date) : 'N/A', leftX + 25, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Statut:', leftX, currentY);
  doc.setFont('helvetica', 'normal');
  if (isInProgress) {
    doc.setTextColor(220, 53, 69);
  } else {
    doc.setTextColor(0, 128, 0);
  }
  doc.text(safeText(statusText), leftX + 25, currentY);
  doc.setTextColor(0, 0, 0);

  // Right column
  const rightX = 110;
  currentY = summaryY + 14;
  doc.setFont('helvetica', 'bold');
  doc.text('Commence le:', rightX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(audit.started_at ? formatDateTime(audit.started_at) : 'N/A', rightX + 28, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Termine le:', rightX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(audit.completed_at ? formatDateTime(audit.completed_at) : 'N/A', rightX + 28, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Duree:', rightX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(safeText(calculateDuration(audit.started_at, audit.completed_at)), rightX + 28, currentY);

  // ============================================================================
  // STATISTICS SECTION
  // ============================================================================
  const statsY = summaryY + 48;

  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 249, 250);
  doc.rect(20, statsY, 170, 30, 'FD');

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('STATISTIQUES', 25, statsY + 7);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  // Left column
  currentY = statsY + 14;
  doc.text(safeText(`Actifs dans le perimetre: ${audit.total_assets}`), leftX, currentY);
  currentY += 5;
  doc.setTextColor(0, 128, 0);
  doc.text(safeText(`Verifies: ${audit.verified_assets}`), leftX, currentY);
  doc.setTextColor(0, 0, 0);
  currentY += 5;
  doc.setTextColor(220, 53, 69);
  doc.text(safeText(`Manquants: ${audit.missing_assets}`), leftX, currentY);
  doc.setTextColor(0, 0, 0);

  // Right column
  currentY = statsY + 14;
  doc.text(safeText(`Exclus: ${excludedCount}`), rightX, currentY);
  if (excludedCount > 0) {
    const reasonCounts: Record<string, number> = {};
    excludedItems.forEach(item => {
      const reason = item.notes || 'Non specifie';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    });
    currentY += 5;
    doc.setFontSize(8);
    for (const [reason, count] of Object.entries(reasonCounts)) {
      doc.text(safeText(`  - ${reason} (${count})`), rightX, currentY);
      currentY += 4;
    }
    doc.setFontSize(9);
  }

  // Completion rate - prominent display
  currentY = statsY + 24;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(safeText(`Taux de completion: ${completionRate.toFixed(1).replace('.', ',')} %`), rightX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  // ============================================================================
  // ITEMS TABLE
  // ============================================================================
  const tableStartY = statsY + 38;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(safeText('DETAIL DES ACTIFS AUDITES'), 20, tableStartY);

  const statusLabels: Record<string, string> = {
    'verified': 'Verifie',
    'missing': 'Manquant',
    'pending': 'En attente',
    'excluded': 'Exclu'
  };

  const tableData = items.map(item => {
    return [
      safeText(item.asset_name || 'N/A'),
      safeText(item.serial_number || 'N/A'),
      safeText(item.category || 'N/A'),
      safeText(item.location || 'N/A'),
      safeText(statusLabels[item.status] || item.status),
      item.verified_at ? formatDateTime(item.verified_at) : 'N/A'
    ];
  });

  autoTable(doc, {
    startY: tableStartY + 5,
    head: [[
      'Equipement',
      'N. Serie',
      'Categorie',
      'Emplacement',
      'Statut',
      'Date de verification'
    ]],
    body: tableData,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
      overflow: 'linebreak',
      cellWidth: 'wrap'
    },
    headStyles: {
      fillColor: [0, 102, 204],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center'
    },
    columnStyles: {
      0: { cellWidth: 35 },                     // Equipement
      1: { cellWidth: 25 },                     // N. Serie
      2: { cellWidth: 28 },                     // Categorie
      3: { cellWidth: 30 },                     // Emplacement
      4: { cellWidth: 22, halign: 'center' },   // Statut
      5: { cellWidth: 30, halign: 'center' }    // Date de verification
    },
    didParseCell: function(data: any) {
      // Color-code status column
      if (data.section === 'body' && data.column.index === 4) {
        const status = data.cell.text[0];
        if (status === 'Verifie') {
          data.cell.styles.textColor = [0, 128, 0];
          data.cell.styles.fontStyle = 'bold';
        } else if (status === 'Manquant') {
          data.cell.styles.textColor = [220, 53, 69];
          data.cell.styles.fontStyle = 'bold';
        } else if (status === 'En attente') {
          data.cell.styles.textColor = [255, 165, 0];
          data.cell.styles.fontStyle = 'bold';
        } else if (status === 'Exclu') {
          data.cell.styles.textColor = [128, 128, 128];
          data.cell.styles.fontStyle = 'italic';
        }
      }
    }
  });

  // ============================================================================
  // MISSING ASSETS SECTION (HIGHLIGHTED)
  // ============================================================================
  if (missingItems.length > 0) {
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Check if we need a new page
    let missingStartY: number;
    if (finalY > 250) {
      doc.addPage();
      missingStartY = 20;
    } else {
      missingStartY = finalY;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 53, 69);
    doc.text(safeText('ACTIFS MANQUANTS'), 20, missingStartY);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      safeText(`${missingItems.length} actif(s) non retrouve(s) lors de l'audit.`),
      20,
      missingStartY + 5
    );

    const missingData = missingItems.map(item => [
      safeText(item.asset_name || 'N/A'),
      safeText(item.serial_number || 'N/A'),
      safeText(item.category || 'N/A'),
      safeText(item.location || 'N/A'),
      safeText(item.notes || 'Aucune remarque')
    ]);

    autoTable(doc, {
      startY: missingStartY + 9,
      head: [[
        'Equipement',
        'N. Serie',
        'Categorie',
        'Dernier emplacement',
        'Remarques'
      ]],
      body: missingData,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [220, 220, 220],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [220, 53, 69],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: 35 },
        4: { cellWidth: 39 }
      }
    });
  }

  // ============================================================================
  // EXCLUDED ASSETS SECTION (WITH REASONS)
  // ============================================================================
  if (excludedItems.length > 0) {
    const finalY = (doc as any).lastAutoTable.finalY + 10;

    // Check if we need a new page
    let excludedStartY: number;
    if (finalY > 250) {
      doc.addPage();
      excludedStartY = 20;
    } else {
      excludedStartY = finalY;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(128, 128, 128);
    doc.text(safeText('ACTIFS EXCLUS DE L\'AUDIT'), 20, excludedStartY);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      safeText(`${excludedItems.length} actif(s) exclus du perimetre de l'audit.`),
      20,
      excludedStartY + 5
    );

    const excludedData = excludedItems.map(item => [
      safeText(item.asset_name || 'N/A'),
      safeText(item.serial_number || 'N/A'),
      safeText(item.category || 'N/A'),
      safeText(item.location || 'N/A'),
      safeText(item.notes || 'Raison non specifiee')
    ]);

    autoTable(doc, {
      startY: excludedStartY + 9,
      head: [[
        'Equipement',
        'N. Serie',
        'Categorie',
        'Emplacement',
        'Raison d\'exclusion'
      ]],
      body: excludedData,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [220, 220, 220],
        lineWidth: 0.1
      },
      headStyles: {
        fillColor: [128, 128, 128],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 44 }
      }
    });
  }

  // ============================================================================
  // FOOTER
  // ============================================================================
  const pageCount = (doc as any).internal.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);

    // Organization name
    doc.text(
      safeText(organization.name),
      105,
      280,
      { align: 'center' }
    );

    // Generation date and branding
    doc.text(
      safeText(`Genere par TraviXO Systems • ${formatDate(new Date().toISOString().split('T')[0])}`),
      20,
      288
    );

    // Page number
    doc.text(
      `Page ${i} sur ${pageCount}`,
      190,
      288,
      { align: 'right' }
    );

    // In-progress banner on every page
    if (isInProgress && i > 1) {
      doc.setFillColor(220, 53, 69);
      doc.rect(0, 0, 210, 8, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('AUDIT EN COURS - RAPPORT PROVISOIRE', 105, 5.5, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
    }
  }

  return Buffer.from(doc.output('arraybuffer'));
}
