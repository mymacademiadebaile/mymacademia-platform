import "dotenv/config";
import { parseEnv } from "./env.schema";

export const env = parseEnv(process.env);
