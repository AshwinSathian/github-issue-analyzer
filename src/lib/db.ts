import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

const resolvedPath = path.resolve(config.STORAGE_PATH);
const storageDir = path.dirname(resolvedPath);

fs.mkdirSync(storageDir, { recursive: true });

const db = new Database(resolvedPath, { fileMustExist: false, readonly: false });
db.pragma('journal_mode = WAL');

export { db };
