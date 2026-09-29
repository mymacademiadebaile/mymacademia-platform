import { Router } from "express";
import { z } from "zod";
import { WEEK_DAYS } from "@mym/shared";
import { DanceClassModel } from "../classes/class.model";
import { objectIdSchema } from "./admin.schemas";

const scheduleSchema = z.object({
  day: z.enum(WEEK_DAYS),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
});

const danceClassSchema = z.object({
  branchId: objectIdSchema,
  name: z.string().trim().min(2).max(120),
  professorIds: z.array(objectIdSchema).min(1),
  disciplineIds: z.array(objectIdSchema).min(1),
  segmentIds: z.array(objectIdSchema).min(1),
  levelIds: z.array(objectIdSchema).min(1),
  capacity: z.number().int().min(1).max(500),
  schedules: z.array(scheduleSchema).min(1)
});

const updateDanceClassSchema = danceClassSchema.partial().extend({
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
});

export const adminClassesRouter = Router();

const populateClass = (query: ReturnType<typeof DanceClassModel.find>) =>
  query
    .populate("professorIds", "displayName avatarUrl")
    .populate("disciplineIds segmentIds levelIds", "name type");

adminClassesRouter.get("/", async (request, response, next) => {
  try {
    const items = await populateClass(
      DanceClassModel.find({
        organizationId: request.auth!.organizationId
      })
    ).sort({ name: 1 });

    response.json(items);
  } catch (error) {
    next(error);
  }
});

adminClassesRouter.get("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const item = await DanceClassModel.findOne({
      _id: id,
      organizationId: request.auth!.organizationId
    })
      .populate("professorIds", "displayName avatarUrl")
      .populate("disciplineIds segmentIds levelIds", "name type");

    if (!item) {
      response.status(404).json({ error: "CLASS_NOT_FOUND" });
      return;
    }

    response.json(item);
  } catch (error) {
    next(error);
  }
});

adminClassesRouter.post("/", async (request, response, next) => {
  try {
    const input = danceClassSchema.parse(request.body);
    const item = await DanceClassModel.create({
      organizationId: request.auth!.organizationId,
      ...input,
      status: "ACTIVE"
    });

    response.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

adminClassesRouter.patch("/:id", async (request, response, next) => {
  try {
    const id = objectIdSchema.parse(request.params.id);
    const input = updateDanceClassSchema.parse(request.body);
    const item = await DanceClassModel.findOneAndUpdate(
      { _id: id, organizationId: request.auth!.organizationId },
      { $set: input },
      { new: true }
    );

    if (!item) {
      response.status(404).json({ error: "CLASS_NOT_FOUND" });
      return;
    }

    response.json(item);
  } catch (error) {
    next(error);
  }
});
