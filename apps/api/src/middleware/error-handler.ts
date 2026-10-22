import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { AppError } from "../common/http/app-error";

type ValidationIssue = {
  code: string;
  message: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
};

function spanishValidationMessage(issue: ValidationIssue): string {
  // Custom schema messages already describe the business rule. All remaining
  // Zod defaults are replaced so raw library messages never reach the UI.
  if (issue.code === "custom") return issue.message;
  if (issue.code === "too_small") {
    return issue.minimum === undefined
      ? "El valor ingresado es demasiado corto"
      : `El valor debe tener al menos ${issue.minimum} caracteres`;
  }
  if (issue.code === "too_big") {
    return issue.maximum === undefined
      ? "El valor ingresado es demasiado largo"
      : `El valor no puede superar los ${issue.maximum} caracteres`;
  }
  if (issue.code === "invalid_type") return "Completá este campo con el formato correcto";
  if (issue.code === "invalid_format") return "El formato ingresado no es válido";
  if (issue.code === "invalid_value") return "El valor seleccionado no es válido";
  if (issue.code === "unrecognized_keys") return "La solicitud contiene campos no permitidos";
  return "El valor ingresado no es válido";
}

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

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "VALIDATION_ERROR",
      issues: error.issues.map((issue) => ({
        ...issue,
        message: spanishValidationMessage(issue)
      }))
    });
    return;
  }

  const known = error instanceof AppError ? error : clientError(error);
  if (known) {
    const details = known.details;
    response.status(known.statusCode).json({
      error: known.code,
      message: known.message,
      ...(details !== undefined ? { details } : {})
    });
    return;
  }

  // Keep infrastructure and request secrets out of logs. The request lifecycle
  // logger already contributes method, route, status, duration and request ID.
  request.log.error(
    { errorName: error instanceof Error && error.name ? error.name : "UnknownError" },
    "Unhandled API error"
  );
  response.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "Ocurrió un error inesperado en el servidor"
  });
};
