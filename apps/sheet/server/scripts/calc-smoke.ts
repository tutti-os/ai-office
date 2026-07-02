import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { XlsxFormulaCalculator } from "../src/artifact/xlsx-formula-calculator.js";
import { readXlsxZip, writeXlsxZip } from "../src/artifact/xlsx-zip.js";

const workbookEntries = [
  {
    name: "[Content_Types].xml",
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
  },
  {
    name: "_rels/.rels",
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  },
  {
    name: "xl/_rels/workbook.xml.rels",
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  },
  {
    name: "xl/workbook.xml",
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
  },
  {
    name: "xl/worksheets/sheet1.xml",
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>3</v></c><c r="A2"><v>4</v></c><c r="B1"><f>SUM(A1:A2)</f><v>0</v></c><c r="C1"><f>B1*2</f><v>0</v></c></row></sheetData></worksheet>',
  },
];

const tempDir = await mkdtemp(join(tmpdir(), "ai-sheet-calc-"));
const workbookPath = join(tempDir, "workbook.xlsx");

try {
  await writeFile(
    workbookPath,
    writeXlsxZip(
      workbookEntries.map((entry) => ({
        name: entry.name,
        data: Buffer.from(entry.xml),
        compression: 8,
        externalAttributes: 0,
      })),
    ),
  );
  const result = await new XlsxFormulaCalculator().calculateFile({
    workbookPath,
    dirtyCells: [{ sheetName: "Sheet1", address: "A1" }],
  });
  const worksheet = readXlsxZip(await readFile(workbookPath))
    .find((entry) => entry.name === "xl/worksheets/sheet1.xml")
    ?.data.toString("utf8");
  if (!result.changed || result.stats?.recalculatedFormulaCount !== 2 || !worksheet?.includes("<v>14</v>")) {
    console.error(JSON.stringify({ result, worksheet }, null, 2));
    process.exit(1);
  }
  console.log(`ai-sheet calc smoke passed: recalculated ${result.stats.recalculatedFormulaCount} formulas`);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}
