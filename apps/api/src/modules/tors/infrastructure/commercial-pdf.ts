import PDFDocument from 'pdfkit';

/**
 * A branded A4 commercial document (ToR or quotation) drawn from PERSISTED figures only. It never
 * recalculates anything: every amount printed is a stored decimal string, so a signed version prints
 * exactly what was signed, whatever the catalogue or the settings say today.
 *
 * Branding: Autonova navy (#142b4a) and blue (#2563eb) from the web design tokens, with a text wordmark.
 * There is no logo file in the repository yet, so the wordmark stands in for it (documented gap).
 */
const NAVY = '#142b4a';
const BLUE = '#2563eb';
const INK = '#172b4d';
const SOFT = '#64748b';
const LINE = '#e2e8f0';
const MARGIN = 50;
const WIDTH = 595.28 - MARGIN * 2;

export interface PdfRow {
  label: string;
  detail?: string | null;
  right?: string | null;
}

export interface PdfSection {
  title: string;
  rows?: PdfRow[];
  paragraph?: string | null;
  /** Rows printed as a two-column "label ... amount" block with the last row emphasised. */
  totals?: { label: string; amount: string; strong?: boolean }[];
  empty?: string;
}

export interface CommercialDocument {
  kindLabel: string;
  number: string;
  subtitle: string;
  reference: { label: string; value: string }[];
  sections: PdfSection[];
  footer: string;
}

export function renderCommercialPdf(doc: CommercialDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `${doc.kindLabel} ${doc.number}`,
        Author: 'Autonova',
        Producer: 'Autonova CRM',
      },
    });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const ensure = (needed: number) => {
      if (pdf.y + needed > pdf.page.height - MARGIN - 30) pdf.addPage();
    };

    pdf.rect(0, 0, pdf.page.width, 86).fill(NAVY);
    pdf.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24).text('AUTONOVA', MARGIN, 30);
    pdf
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#cbd5e1')
      .text('Technology that runs your business', MARGIN, 58);
    pdf
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#ffffff')
      .text(doc.kindLabel.toUpperCase(), MARGIN, 32, { align: 'right', width: WIDTH });
    pdf
      .font('Helvetica')
      .fontSize(11)
      .text(doc.number, MARGIN, 52, { align: 'right', width: WIDTH });

    pdf
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(doc.subtitle, MARGIN, 110, { width: WIDTH });
    pdf.moveDown(0.6);
    for (const ref of doc.reference) {
      pdf
        .font('Helvetica')
        .fontSize(9)
        .fillColor(SOFT)
        .text(ref.label.toUpperCase(), { continued: true });
      pdf.font('Helvetica').fontSize(10).fillColor(INK).text(`   ${ref.value}`);
    }
    pdf.moveDown(0.8);

    for (const section of doc.sections) {
      ensure(60);
      pdf.moveDown(0.4);
      pdf.font('Helvetica-Bold').fontSize(12).fillColor(BLUE).text(section.title);
      const y = pdf.y + 2;
      pdf
        .moveTo(MARGIN, y)
        .lineTo(MARGIN + WIDTH, y)
        .strokeColor(LINE)
        .lineWidth(1)
        .stroke();
      pdf.moveDown(0.5);

      if (section.paragraph) {
        pdf.font('Helvetica').fontSize(10).fillColor(INK).text(section.paragraph, { width: WIDTH });
      }
      if (section.rows && section.rows.length > 0) {
        for (const row of section.rows) {
          ensure(34);
          const top = pdf.y;
          const rightWidth = row.right ? 120 : 0;
          pdf
            .font('Helvetica-Bold')
            .fontSize(10)
            .fillColor(INK)
            .text(row.label, MARGIN, top, { width: WIDTH - rightWidth - 8 });
          const afterLabel = pdf.y;
          if (row.right) {
            pdf
              .font('Helvetica')
              .fontSize(10)
              .fillColor(INK)
              .text(row.right, MARGIN + WIDTH - rightWidth, top, {
                width: rightWidth,
                align: 'right',
              });
          }
          pdf.y = Math.max(afterLabel, pdf.y);
          if (row.detail) {
            pdf
              .font('Helvetica')
              .fontSize(9)
              .fillColor(SOFT)
              .text(row.detail, MARGIN, pdf.y, { width: WIDTH - rightWidth - 8 });
          }
          pdf.moveDown(0.4);
        }
      } else if (!section.paragraph && !section.totals && section.empty) {
        pdf.font('Helvetica-Oblique').fontSize(10).fillColor(SOFT).text(section.empty);
      }
      if (section.totals) {
        for (const total of section.totals) {
          ensure(20);
          const top = pdf.y;
          pdf
            .font(total.strong ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(total.strong ? 11 : 10)
            .fillColor(INK)
            .text(total.label, MARGIN, top, { width: WIDTH - 140 });
          pdf.text(total.amount, MARGIN + WIDTH - 140, top, { width: 140, align: 'right' });
          pdf.moveDown(0.3);
        }
      }
    }

    const pages = pdf.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      pdf.switchToPage(pages.start + i);
      pdf
        .font('Helvetica')
        .fontSize(8)
        .fillColor(SOFT)
        .text(`${doc.footer}   ·   Page ${i + 1} of ${pages.count}`, MARGIN, pdf.page.height - 40, {
          width: WIDTH,
          align: 'center',
          lineBreak: false,
        });
    }
    pdf.end();
  });
}
