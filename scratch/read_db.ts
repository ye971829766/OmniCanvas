import { Database } from "bun:sqlite";
import { join } from "path";
import * as fs from "fs";

const dbPath = join(process.cwd(), "server/data/database.db");
const db = new Database(dbPath);

let out = "";

out += "=== CHANNELS ===\n";
const channels = db.query("SELECT * FROM channels").all();
out += JSON.stringify(channels, null, 2);

out += "\n\n=== MODEL CONFIG ===\n";
const modelConfigs = db.query("SELECT * FROM model_config").all();
out += JSON.stringify(modelConfigs, null, 2);

fs.writeFileSync(join(process.cwd(), "scratch/db_out.txt"), out, "utf-8");
console.log("Done");
