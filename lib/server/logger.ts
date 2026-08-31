import pino from "pino";
import { env } from "./env";

export const logger = pino({ level: env.logLevel, redact: ["req.headers.authorization", "apiKey", "password", "token", "secret"] });
