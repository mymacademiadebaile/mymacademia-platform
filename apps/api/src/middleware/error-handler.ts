import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { AppError } from "../common/http/app-error";

/** Client mistakes that libraries raise as plain errors. They must never look like a server failure. */
function clientError(error: unknown): AppError | undefined {
  if (error instanceof MulterError) {
    return error.code === "LIMIT_FILE_SIZE"
      ? new AppError(413, "El archivo supera el tamaño permitido", "FILE_TOO_LARGE")
      : new AppError(422, "El archivo no se pudo procesar", "INVALID_UPLOAD");
  }

  if (error instanceof mongoose.Error.CastError) {
    return new AppError(400, "Uno de los identificadores no es válido", "INVALID_ID");
  }

  const candidate = error as { code?: number; type?: string; status?: number };
  if (candidate?.code === 11000) {
    return new AppError(409, "El registro ya existe", "DUPLICATE_RECORD");
  }

  // body-parser marks malformed JSON with type "entity.parse.failed".
  if (candidate?.type === "entity.parse.failed" || (error instanceof SyntaxError && candidate?.status === 400)) {
    return new AppError(400, "El cuerpo de la solicitud no es JSON válido", "INVALID_JSON");
  }

  return undefined;
}

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "VALIDATION_ERROR",
      issues: error.issues
    });
    return;
  }

  const known = error instanceof AppError ? error : clientError(error);
  if (known) {
    response.status(known.statusCode).json({
      error: known.code,
      message: known.message
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "Unexpected server error"
  });
};
