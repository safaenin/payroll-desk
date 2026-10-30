import { expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseAttendance } from './importer';
it('reads real Excel dates and string payable values', async () => {
  const wb = new ExcelJS.Workbook(),
    s = wb.addWorksheet('Attendance');
  s.addRow([
    'employee_code',
    'full_name',
    'scheduled_date',
    'employee_role_name',
    'muster_status',
    'muster_payable',
    'store_name',
    'primary_store',
  ]);
  s.addRow(['E1', 'Example', new Date('2026-09-30T00:00:00Z'), 'FR_Packer', 'HD', '0.5', 'A', 'A']);
  const result = await parseAttendance((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  expect(result[0]).toMatchObject({ code: 'E1', date: '2026-09-30', payable: 0.5 });
});
it('rejects a salary workbook instead of misreading it as attendance', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('Salary');
  await expect(parseAttendance((await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(
    'Attendance worksheet',
  );
});

it('imports F and Failed as unpaid and rejects paid Failed records', async () => {
  for (const status of ['F', 'Failed']) {
    const wb = new ExcelJS.Workbook(),
      sheet = wb.addWorksheet('Attendance');
    sheet.addRow([
      'employee_code',
      'full_name',
      'scheduled_date',
      'employee_role_name',
      'muster_status',
      'muster_payable',
      'store_name',
      'primary_store',
    ]);
    sheet.addRow(['E1', 'Example', '2026-09-01', 'FR_Packer', status, 0, 'A', 'A']);
    expect((await parseAttendance((await wb.xlsx.writeBuffer()) as ArrayBuffer))[0]).toMatchObject({
      status: 'F',
      payable: 0,
    });
    sheet.getRow(2).getCell(6).value = 1;
    await expect(parseAttendance((await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(
      'disagree',
    );
  }
});
