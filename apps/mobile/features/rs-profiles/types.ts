export interface RsProfile {
  portalDebt?: {
    total: string;
    balance: string;
    upcoming?: string;
    asOf: string;
    checkedAt: string;
    source: "RS_PORTAL";
    sourceUrl: string;
  };
  taxpayerId?: string;
  debt?: {
    fetchedAt: string;
    total: string;
    status: string;
    rows: { treasuryCode: string; treasuryCodeName: string; amount: string }[];
  } | null;
  debtError?: string | null;
  debtAttemptAt?: string;
  uid: string;
  name: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  connectionState: "not_checked" | "received" | "error";
  errorCode: string | null;
  response:
    | RsZReportResponse
    | {
        fetchedAt: string;
        operation: string;
        mappingStatus: "NOT_VERIFIED";
        rows: { code: string; debtAmount: string }[];
      }
    | null;
}
export interface ZReport {
  deviceNumber: string;
  reportDate: string;
  quantity: number;
  paidAmount: string;
  paidCash: string;
  paidOther: string;
  zNumber: string;
}
export interface RsZReportResponse {
  fetchedAt: string;
  operation: "Get_Z_Report_Details";
  from: string;
  to: string;
  outcome: "ok" | "no_records";
  reports: ZReport[];
  summary: {
    paidAmount: string;
    paidCash: string;
    paidOther: string;
    quantity: number;
    registerCount: number;
    reportCount: number;
  };
  chart: { date: string; amount: string }[];
}
export const rsErrors: Record<string, string> = {
  RS_PORTAL_LOGIN_REQUIRED:
    "RS კაბინეტში შესვლა ვერ დასრულდა. გადაამოწმეთ პროფილის მონაცემები; შესაძლოა SMS დადასტურებაა საჭირო.",
  RS_PORTAL_ID_MISMATCH:
    "RS-ში შესული ანგარიში პროფილის საიდენტიფიკაციო ნომერს არ ემთხვევა. თანხა არ განახლებულა.",
  RS_PORTAL_FORMAT_CHANGED:
    "RS-ის გვერდის ფორმატი ვერ ამოვიცანით. წინა თანხა შენარჩუნებულია.",
  RS_PORTAL_UNAVAILABLE:
    "RS კაბინეტიდან განახლება ვერ მოხერხდა. სცადეთ მოგვიანებით.",
  RS_PORTAL_BUSY: "სხვა ანგარიშების შემოწმება მიმდინარეობს. სცადეთ ცოტა ხანში.",
  RS_TAXPAYER_ID_REQUIRED:
    "დავალიანების შესამოწმებლად პროფილის პარამეტრებში შეავსეთ საიდენტიფიკაციო / პირადი ნომერი.",
  RS_DEBT_NOT_CONFIRMED:
    "RS-მა დავალიანების თანხა არ დააბრუნა. ნულოვანი დავალიანება დადასტურებული არ არის; შესაძლოა ამ სერვისზე სპეციალური წვდომაა საჭირო.",
  RS_INVALID_CREDENTIALS:
    "RS სერვისმა ავტორიზაცია უარყო (კოდი 1: მომხმარებელი/პაროლი). იგზავნება ამ პროფილში შენახული მონაცემები დაუჰეშავად. უარყოფის ზუსტი მიზეზი RS-ის პასუხით არ დგინდება.",
  RS_REMOTE_SYSTEM_ERROR:
    "RS-ის სისტემური შეცდომა (კოდი 0). სცადეთ მოგვიანებით.",
  RS_REMOTE_ERROR:
    "RS-მა მოთხოვნა უარყო. სერვისის დაბრუნებული კოდი დასაზუსტებელია.",
  RS_UNSUPPORTED_PRECISION:
    "RS-ის თანხის სიზუსტე მოსალოდნელს არ შეესაბამება. თანხები არ დამრგვალებულა.",
  RS_RESPONSE_OUT_OF_RANGE:
    "RS-მა არჩეული პერიოდის გარეთ არსებული ჩანაწერი დააბრუნა. მონაცემები არ დაჯამებულა.",
  RS_CONFLICTING_RECORDS:
    "RS-ის პასუხში დუბლირებული Z-რეპორტის თანხები ერთმანეთს არ ემთხვევა. მონაცემები არ დაჯამებულა.",
  RS_NO_DATA:
    "RS-მა XML პასუხი დააბრუნა, მაგრამ შედეგი არ მოჰყოლია. გადაამოწმეთ ამ SOAP სერვისზე ანგარიშის დაშვება. ცარიელი პასუხი არც პაროლის სისწორეს და არც ნულოვან დავალიანებას ადასტურებს.",
  RS_CONNECTION_FAILED:
    "RS სერვისთან დაკავშირება ვერ მოხერხდა. სცადეთ მოგვიანებით.",
  RS_ACCESS_DENIED:
    "RS სერვისზე წვდომა უარყოფილია. გადაამოწმეთ ამ სერვისის გამოყენების უფლება და პროფილის მონაცემები.",
  RS_SOAP_FAULT:
    "RS სერვისმა შეცდომა დააბრუნა. შესაძლოა ანგარიში ამ სერვისზე დაშვებული არ არის.",
  RS_SERVICE_ERROR: "RS სერვისი დროებით მიუწვდომელია.",
  RS_INVALID_RESPONSE: "RS სერვისის პასუხი მოსალოდნელ ფორმატს არ შეესაბამება.",
  RS_RESPONSE_TOO_LARGE: "RS სერვისის პასუხი დასაშვებ ზომას აღემატება.",
};
export interface RsInboxMessage {
  id: string;
  subject: string;
  sentAt: string;
  read: boolean;
  preview: string;
  text: string;
}
export interface RsInbox {
  checkedAt: string | null;
  error: string | null;
  messages: RsInboxMessage[];
}
