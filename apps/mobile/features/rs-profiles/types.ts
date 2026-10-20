export interface RsProfile {
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
