import { randomUUID } from "node:crypto";
import { decimal, localDate, type Dataset } from "@biz/shared";
export const DEMO_BUSINESS = "11111111-1111-4111-8111-111111111111";
export function createDemo(now = new Date()): Dataset {
  const syncedAt = now.toISOString();
  const provenance = { source: "demo" as const, sourceAt: syncedAt, syncedAt };
  const today = localDate(now);
  const relative = (days: number) => {
    const d = new Date(today + "T12:00:00+04:00");
    d.setUTCDate(d.getUTCDate() + days);
    return localDate(d);
  };
  const registers = ["რუსთაველი · მთავარი", "ვაკე · ფილიალი"].map(
    (name, i) => ({
      uid: randomUUID(),
      name,
      externalId: `DEMO-REG-${i + 1}`,
      status: "active",
      ...provenance,
    }),
  );
  const receipts: Dataset["receipts"] = [];
  for (let day = -29; day <= 0; day++)
    for (let n = 0; n < 12 + ((day + 30) % 9); n++) {
      const date = relative(day);
      receipts.push({
        uid: randomUUID(),
        businessUid: DEMO_BUSINESS,
        externalId: `DEMO-${date}-${n}`,
        registerUid: registers[n % 2].uid,
        occurredAt: `${date}T${String(9 + (n % 11)).padStart(2, "0")}:15:00+04:00`,
        amount: decimal(BigInt(1800 + (((day + 30) * 977 + n * 1733) % 22000))),
        currency: "GEL",
        status:
          n === 3 && day % 5 === 0
            ? "refund"
            : n === 4 && day % 7 === 0
              ? "void"
              : "sale",
        paymentMethod: null,
        ...provenance,
      });
    }
  const accounts: Dataset["accounts"] = [
    {
      uid: randomUUID(),
      bank: "TBC · Demo",
      iban: "GE•• •••• •••• 2401",
      balance: "18425.80",
      currency: "GEL",
      ...provenance,
    },
    {
      uid: randomUUID(),
      bank: "Bank of Georgia · Demo",
      iban: "GE•• •••• •••• 7812",
      balance: "6832.40",
      currency: "GEL",
      ...provenance,
    },
  ];
  const transactions: Dataset["transactions"] = Array.from(
    { length: 45 },
    (_, i) => ({
      uid: randomUUID(),
      businessUid: DEMO_BUSINESS,
      externalId: `DEMO-TX-${i}`,
      accountUid: accounts[i % 2].uid,
      occurredAt: `${relative(-Math.floor(i / 2))}T12:30:00+04:00`,
      amount: decimal(BigInt(12000 + i * 2137)),
      currency: "GEL",
      description: [
        "POS settlement",
        "Supplier payment",
        "Owner deposit",
        "Customer transfer",
        "Rent",
      ][i % 5],
      category: [
        "settlement",
        "expense",
        "owner_deposit",
        "customer_payment",
        "expense",
      ][i % 5],
      direction: i % 5 === 1 || i % 5 === 4 ? "outgoing" : "incoming",
      ...provenance,
    }),
  );
  const obligations: Dataset["obligations"] = [
    {
      uid: randomUUID(),
      taxType: "small_business",
      period: today.slice(0, 7),
      dueDate: relative(7),
      amount: "286.40",
      estimated: true,
      status: "upcoming",
      kind: "payment",
      ...provenance,
    },
    {
      uid: randomUUID(),
      taxType: "small_business",
      period: today.slice(0, 7),
      dueDate: relative(7),
      amount: null,
      estimated: false,
      status: "upcoming",
      kind: "filing",
      ...provenance,
    },
    {
      uid: randomUUID(),
      taxType: "small_business",
      period: relative(-30).slice(0, 7),
      dueDate: relative(-5),
      amount: "174.20",
      estimated: true,
      status: "overdue",
      kind: "payment",
      ...provenance,
    },
  ];
  return {
    business: {
      uid: DEMO_BUSINESS,
      name: "თბილისის მარკეტი",
      owner: "ნინო დემო",
      taxId: "010•••••123",
      taxProfile: ["small_business"],
    },
    registers,
    receipts,
    accounts,
    transactions,
    settlements: [
      {
        uid: randomUUID(),
        amount: transactions[0].amount,
        settledAt: transactions[0].occurredAt,
        transactionUid: transactions[0].uid,
        ...provenance,
      },
    ],
    debts: [
      {
        uid: randomUUID(),
        taxType: "small_business",
        amount: "174.20",
        credit: "0.00",
        confirmed: false,
        ...provenance,
      },
    ],
    obligations,
    declarations: [
      {
        uid: randomUUID(),
        taxType: "small_business",
        period: relative(-30).slice(0, 7),
        dueDate: relative(-5),
        status: "submitted",
        submittedAt: relative(-8) + "T10:00:00+04:00",
        amount: "174.20",
        ...provenance,
      },
      {
        uid: randomUUID(),
        taxType: "small_business",
        period: today.slice(0, 7),
        dueDate: relative(7),
        status: "draft",
        submittedAt: null,
        amount: null,
        ...provenance,
      },
    ],
    integrations: [
      {
        uid: "rs-demo",
        name: "Revenue Service · Demo",
        source: "demo",
        state: "connected",
        capability: "VERIFIED_AVAILABLE",
        lastSuccessAt: syncedAt,
        message: "Simulated data only",
      },
      {
        uid: "bank-demo",
        name: "Banking · Demo",
        source: "demo",
        state: "connected",
        capability: "VERIFIED_AVAILABLE",
        lastSuccessAt: syncedAt,
        message: "Simulated data only",
      },
      {
        uid: "rs-soap",
        name: "RS SOAP",
        source: "live",
        state: "unsupported",
        capability: "NOT_VERIFIED",
        lastSuccessAt: null,
        message: "Authorization and response semantics require verification",
      },
      {
        uid: "tbc",
        name: "TBC Bank",
        source: "live",
        state: "unsupported",
        capability: "REQUIRES_AUTHORIZATION",
        lastSuccessAt: null,
        message: "No authorized adapter configured",
      },
      {
        uid: "bog",
        name: "Bank of Georgia",
        source: "live",
        state: "unsupported",
        capability: "REQUIRES_AUTHORIZATION",
        lastSuccessAt: null,
        message: "No authorized adapter configured",
      },
    ],
    notifications: [
      {
        uid: randomUUID(),
        title: "დემო გარემო მზადაა",
        body: "ყველა თანხა და ვადა სიმულირებულია.",
        read: false,
        eventKey: "demo-welcome",
        createdAt: syncedAt,
      },
    ],
    reconciliations: [],
    preferences: {
      language: "ka",
      theme: "system",
      reminders: [7, 3, 1, 0],
      detailedNotifications: false,
      pushEnabled: false,
      salesChangePercent: 30,
    },
    logs: [],
  };
}
