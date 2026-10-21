#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "sqlite3.h"
static const char *file;
static void ok(sqlite3 *db,const char *sql){int rc=exsqlite3_exec(db,sql,0,0,0);if(rc){fprintf(stderr,"SQLCipher verification failed (%d): %s\n",rc,exsqlite3_errmsg(db));exit(1);}}
int main(int argc, char **argv){
 if(argc!=2)return 64;file=argv[1];
 sqlite3 *base,*tx,*reopen;remove(file);
 exsqlite3_open(file,&base);ok(base,"PRAGMA key='regression-only-key';CREATE TABLE profiles(uid TEXT PRIMARY KEY, value TEXT);INSERT INTO profiles VALUES('existing','preserved');");
 exsqlite3_open(file,&tx);ok(tx,"BEGIN");
 int code=exsqlite3_exec(tx,"SELECT * FROM profiles",0,0,0);
 if(code!=26){fprintf(stderr,"Expected old unkeyed transaction to fail with 26, got %d\n",code);return 2;}
 ok(tx,"ROLLBACK");exsqlite3_close(tx);
 exsqlite3_open(file,&tx);ok(tx,"PRAGMA key='regression-only-key';BEGIN IMMEDIATE;INSERT INTO profiles VALUES('new','saved');COMMIT;");exsqlite3_close(tx);exsqlite3_close(base);
 exsqlite3_open(file,&reopen);ok(reopen,"PRAGMA key='regression-only-key';");exsqlite3_stmt *statement;
 if(exsqlite3_prepare_v2(reopen,"SELECT COUNT(*) FROM profiles",-1,&statement,0)!=SQLITE_OK)return 3;
 if(exsqlite3_step(statement)!=SQLITE_ROW||exsqlite3_column_int(statement,0)!=2)return 4;
 exsqlite3_finalize(statement);exsqlite3_close(reopen);remove(file);
 puts("PASS: reproduced code 26 on an unkeyed new connection; keyed-before-BEGIN transaction commits and preserves existing encrypted records after reopening.");return 0;
}
