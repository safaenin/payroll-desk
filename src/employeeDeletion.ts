import type { State } from './domain';

export type EmployeeDeletion = {
  id: string;
  code: string;
  requestedAt: string;
  fileIds: string[];
  completedFileIds: string[];
};
export function deletionSummary(state: State, code: string) {
  return {
    attendance: state.attendance.filter((a) => a.code === code).length,
    payrolls: state.runs.filter((r) => r.lines.some((l) => l.code === code)).length,
    payments: state.payments.filter((p) => p.code === code).length,
    advances: (state.advances ?? []).filter((a) => a.code === code).length,
    documents: state.files.filter((f) => f.code === code).length,
  };
}
/** Remove only the target's records, preserving other employees in shared months. */
export function purgeEmployee(state: State, code: string): State {
  const fileIds = new Set([
    ...state.files.filter((f) => f.code === code).map((f) => f.id),
    ...(state.employeeDeletion?.code === code ? state.employeeDeletion.fileIds : []),
  ]);
  return {
    ...state,
    employees: state.employees.filter((e) => e.code !== code),
    attendance: state.attendance.filter((a) => a.code !== code),
    adjustments: Object.fromEntries(
      Object.entries(state.adjustments).map(([month, rows]) => [
        month,
        rows.filter((a) => a.code !== code),
      ]),
    ),
    runs: state.runs.map((r) => ({ ...r, lines: r.lines.filter((l) => l.code !== code) })),
    payments: state.payments.filter((p) => p.code !== code),
    advances: (state.advances ?? []).filter((a) => a.code !== code),
    files: state.files.filter((f) => f.code !== code),
    fileDeletions: (state.fileDeletions ?? []).filter((d) => !fileIds.has(d.id)),
    imports: state.imports.map((i) => ({
      ...i,
      revisions: i.revisions.filter((r) => r.before.code !== code && r.after.code !== code),
    })),
  };
}
