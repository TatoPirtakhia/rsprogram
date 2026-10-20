import mysql from "mysql2/promise";
export function createPool(url: string) {
  return mysql.createPool({
    uri: url,
    connectionLimit: 8,
    decimalNumbers: false,
    dateStrings: true,
    multipleStatements: false,
    timezone: "Z",
  });
}
