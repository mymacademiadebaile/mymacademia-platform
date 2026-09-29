import { Router } from "express";
import { loginSchema } from "./auth.schemas";
import { login } from "./auth.service";

export const authRouter = Router();

authRouter.post("/login", async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const result = await login(input);
    response.json(result);
  } catch (error) {
    next(error);
  }
});
