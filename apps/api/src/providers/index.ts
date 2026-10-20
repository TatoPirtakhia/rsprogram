import type {
  IntegrationStatus,
  TaxDebt,
  TaxObligation,
  Declaration,
  Receipt,
  CashRegister,
  BankAccount,
  BankTransaction,
  MerchantSettlement,
  RecordQuery,
  Page,
  Dataset,
} from "@biz/shared";
import { paginate } from "../modules/finance.js";
export class UnsupportedError extends Error {
  readonly code = "UNSUPPORTED";
  constructor(message: string) {
    super(message);
  }
}
export interface RevenueServiceProvider {
  getConnectionStatus(): Promise<IntegrationStatus>;
  getTaxDebt(): Promise<TaxDebt[]>;
  getTaxObligations(): Promise<TaxObligation[]>;
  getDeclarations(): Promise<Declaration[]>;
  getFiscalReceipts(query: RecordQuery): Promise<Page<Receipt>>;
  getCashRegisters(): Promise<CashRegister[]>;
}
export interface BankProvider {
  getConnectionStatus(): Promise<IntegrationStatus>;
  getAccounts(): Promise<BankAccount[]>;
  getTransactions(query: RecordQuery): Promise<Page<BankTransaction>>;
  getMerchantSettlements(query: RecordQuery): Promise<MerchantSettlement[]>;
}
export class RsDemoProvider implements RevenueServiceProvider {
  constructor(protected data: Dataset) {}
  async getConnectionStatus() {
    return this.data.integrations[0];
  }
  async getTaxDebt() {
    return this.data.debts;
  }
  async getTaxObligations() {
    return this.data.obligations;
  }
  async getDeclarations() {
    return this.data.declarations;
  }
  async getFiscalReceipts(q: RecordQuery) {
    return paginate(this.data.receipts, q);
  }
  async getCashRegisters() {
    return this.data.registers;
  }
}
export class RsImportProvider extends RsDemoProvider {
  override async getTaxDebt(): Promise<TaxDebt[]> {
    throw new UnsupportedError("Imported receipts cannot establish tax debt");
  }
  override async getTaxObligations(): Promise<TaxObligation[]> {
    throw new UnsupportedError("No verified obligation import schema");
  }
  override async getDeclarations(): Promise<Declaration[]> {
    throw new UnsupportedError("No verified declaration import schema");
  }
  override async getFiscalReceipts(q: RecordQuery) {
    return paginate(
      this.data.receipts.filter((r) => r.source === "import"),
      q,
    );
  }
  override async getCashRegisters() {
    return this.data.registers.filter((r) => r.source === "import");
  }
  override async getConnectionStatus(): Promise<IntegrationStatus> {
    return {
      uid: "rs-import",
      name: "User import",
      source: "import",
      state: "connected",
      capability: "VERIFIED_AVAILABLE",
      lastSuccessAt: null,
      message: "User-supplied records; not official verified data",
    };
  }
}
export class RsSoapProvider implements RevenueServiceProvider {
  async getConnectionStatus(): Promise<IntegrationStatus> {
    return {
      uid: "rs-soap",
      name: "RS SOAP",
      source: "live",
      state: "unsupported",
      capability: "NOT_VERIFIED",
      lastSuccessAt: null,
      message:
        "Published candidate is not enabled without verified authorization and field semantics",
    };
  }
  private unavailable(): never {
    throw new UnsupportedError(
      "RS capability has not been verified for this taxpayer",
    );
  }
  async getTaxDebt(): Promise<TaxDebt[]> {
    return this.unavailable();
  }
  async getTaxObligations(): Promise<TaxObligation[]> {
    return this.unavailable();
  }
  async getDeclarations(): Promise<Declaration[]> {
    return this.unavailable();
  }
  async getFiscalReceipts(_q: RecordQuery): Promise<Page<Receipt>> {
    return this.unavailable();
  }
  async getCashRegisters(): Promise<CashRegister[]> {
    return this.unavailable();
  }
}
export class DemoBankProvider implements BankProvider {
  constructor(private data: Dataset) {}
  async getConnectionStatus() {
    return this.data.integrations[1];
  }
  async getAccounts() {
    return this.data.accounts;
  }
  async getTransactions(q: RecordQuery) {
    return paginate(this.data.transactions, q);
  }
  async getMerchantSettlements(_q: RecordQuery) {
    return this.data.settlements;
  }
}
export class AuthorizedBankPlaceholder implements BankProvider {
  constructor(private name: "TBC Bank" | "Bank of Georgia") {}
  async getConnectionStatus(): Promise<IntegrationStatus> {
    return {
      uid: this.name,
      name: this.name,
      source: "live",
      state: "unsupported",
      capability: "REQUIRES_AUTHORIZATION",
      lastSuccessAt: null,
      message:
        "Approved documentation, account permissions and credentials required",
    };
  }
  private unavailable(): never {
    throw new UnsupportedError("No authorized bank adapter configured");
  }
  async getAccounts(): Promise<BankAccount[]> {
    return this.unavailable();
  }
  async getTransactions(_q: RecordQuery): Promise<Page<BankTransaction>> {
    return this.unavailable();
  }
  async getMerchantSettlements(_q: RecordQuery): Promise<MerchantSettlement[]> {
    return this.unavailable();
  }
}
