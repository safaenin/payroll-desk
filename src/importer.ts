import ExcelJS from 'exceljs';
import type { Attendance } from './domain';
export async function parseAttendance(buffer: ArrayBuffer): Promise<Attendance[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Attendance');
  if (!sheet)
    throw new Error('Expected an Attendance worksheet. Salary workbooks use a different format.');
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((c, i) => headers.set(c.text.trim(), i));
  const required = [
    'employee_code',
    'full_name',
    'scheduled_date',
    'employee_role_name',
    'muster_status',
    'muster_payable',
    'store_name',
    'primary_store',
  ];
  for (const h of required) if (!headers.has(h)) throw new Error(`Missing column: ${h}`);
  const rows: Attendance[] = [];
  sheet.eachRow((row, i) => {
    if (i === 1) return;
    const get = (h: string) => row.getCell(headers.get(h)!);
    const code = get('employee_code').text.trim();
    if (!code) throw new Error(`Row ${i}: employee code is missing.`);
    const raw = get('scheduled_date').value;
    let date = '';
    if (raw instanceof Date) date = raw.toISOString().slice(0, 10);
    else if (typeof raw === 'number')
      date = new Date(Date.UTC(1899, 11, 30) + raw * 86400000).toISOString().slice(0, 10);
    else if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) date = raw;
    if (
      !date ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error(`Row ${i}: invalid or ambiguous date.`);
    const text = get('muster_payable').text.trim(),
      payable = Number(text);
    if (!text || ![0, 0.5, 1].includes(payable))
      throw new Error(`Row ${i}: payable days must be 0, 0.5 or 1.`);
    const status = get('muster_status').text.trim(),
      role = get('employee_role_name').text.trim();
    if (!role || !status || !get('full_name').text.trim())
      throw new Error(`Row ${i}: name, role and status are required.`);
    if ((status === 'P' && payable !== 1) || (status === 'HD' && payable !== 0.5))
      throw new Error(`Row ${i}: attendance status and payable value disagree.`);
    rows.push({
      code,
      name: get('full_name').text.trim(),
      date,
      role,
      status,
      payable,
      store: get('store_name').text.trim(),
      primaryStore: get('primary_store').text.trim(),
    });
  });
  if (!rows.length) throw new Error('No attendance records found.');
  return rows;
}
