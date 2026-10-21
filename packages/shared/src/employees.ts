export interface RsEmployee {
  id: string;
  tin: string;
  name: string;
  status: -1 | 0 | 1;
  workType: string;
  activatedAt: string | null;
  salary: null;
}
export type RsEmployeesResult =
  | { state: "pin_required"; challengeId: string; mobile: string }
  | {
      state: "ready";
      employees: RsEmployee[];
      total: number;
      truncated: boolean;
      checkedAt: string;
      salaryAvailable: false;
    };
