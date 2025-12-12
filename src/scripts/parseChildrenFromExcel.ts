import * as XLSX from 'xlsx';
import type { Child, Gender } from '../types/child';

function parseGender(value: unknown): Gender | null {
  if (typeof value !== 'string') return null;

  const v = value.trim().toUpperCase();
  if (v === 'M' || v === 'W') return v;

  return null;
}

function parseChildrenFromExcel(file: File): Promise<Child[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      // Sheet → 2D-Array
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
      });

      // Daten ab Zeile 3 (Index 2)
      const dataRows = rows.slice(2);

      const children: Child[] = [];

      dataRows.forEach((row, index) => {
        const vorname = String(row[0] ?? '').trim();    // B
        const nachname = String(row[1] ?? '').trim();   // C
        const jahrgang = String(row[2] ?? '').trim();   // D
        const gender = parseGender(row[3]);             // E

        // komplett leere Zeilen ignorieren
        if (!vorname && !nachname && !jahrgang && !row[4]) {
          return;
        }

        // harte Validierung
        if (!vorname || !nachname || !jahrgang || !gender) {
          console.warn(
            `Ungültige Zeile ${index + 3} übersprungen`,
            row
          );
          return;
        }

        children.push({
          id: crypto.randomUUID(),
          vorname,
          nachname,
          jahrgang,
          geschlecht: gender,
        });
      });

      resolve(children);
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export default parseChildrenFromExcel