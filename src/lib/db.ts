import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

type SQLiteDatabase = InstanceType<typeof Database>;

export const createDatabase = (storagePath: string): SQLiteDatabase => {
  const resolvedPath = path.resolve(storagePath);
  const storageDir = path.dirname(resolvedPath);

  fs.mkdirSync(storageDir, { recursive: true });

  const database = new Database(resolvedPath, { fileMustExist: false, readonly: false });
  database.pragma('journal_mode = WAL');

  return database;
};
