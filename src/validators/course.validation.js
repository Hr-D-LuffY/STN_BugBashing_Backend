// validation schemas for creating and updating courses
// Unknown keys (for example _id, createdAt, __v) are dropped, so only the
// fields below can ever be saved.

const { z } = require("zod");
const isObjectId = require("../utils/isObjectId");

const isHttpUrl = (text) => {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const requiredText = (label, max) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalText = (label, max) =>
  z.string({ error: `${label} must be text` }).trim().max(max, `${label} must be at most ${max} characters`).optional();

const httpUrl = (label) =>
  z.string({ error: `${label} is required` }).trim().refine(isHttpUrl, `${label} must be a valid http or https URL`);

// the forms send "" for an empty optional field
const optionalHttpUrl = (label) => z.union([z.literal(""), httpUrl(label)]).optional();

const optionalDate = (label) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.date({ error: `${label} must be a valid date` }).optional()
  );

// ids of existing modules and lessons are kept so student progress stays valid
const objectIdString = z.string().refine(isObjectId, "Invalid id").optional();

const quizQuestionSchema = z
  .object({
    question: requiredText("Quiz question", 500),
    options: z
      .array(requiredText("Quiz option", 300), { error: "Quiz options are required" })
      .min(2, "A quiz question needs at least 2 options")
      .max(10, "A quiz question can have at most 10 options"),
    correctIndex: z
      .number({ error: "Correct answer must be a number" })
      .int("Correct answer must be a whole number")
      .min(0, "Correct answer must be one of the options"),
  })
  .refine((q) => q.correctIndex < q.options.length, {
    message: "Correct answer must be one of the options",
    path: ["correctIndex"],
  });

const lessonSchema = z.object({
  _id: objectIdString,
  title: requiredText("Lesson title", 200),
  videoUrl: httpUrl("Video URL"),
  liveClassLink: optionalHttpUrl("Live class link"),
  liveClassDate: optionalDate("Live class date"),
  assignmentPrompt: optionalText("Assignment prompt", 5000),
  quiz: z.array(quizQuestionSchema).max(50, "A lesson can have at most 50 quiz questions").optional(),
});

const moduleSchema = z.object({
  _id: objectIdString,
  title: requiredText("Module title", 200),
  lessons: z.array(lessonSchema, { error: "Lessons must be a list" }).max(200).optional(),
});

const batchSchema = z.object({
  _id: objectIdString,
  name: requiredText("Batch name", 100),
  startDate: optionalDate("Batch start date"),
});

const courseFields = {
  title: requiredText("Title", 150),
  description: requiredText("Description", 5000),
  instructorName: requiredText("Instructor name", 100),
  price: z
    .number({ error: "Price must be a number" })
    .finite("Price must be a number")
    .min(0, "Price cannot be negative")
    .max(10000000, "Price is too large"),
  category: optionalText("Category", 60),
  tags: z
    .array(z.string({ error: "Tags must be text" }).trim().min(1).max(40, "A tag must be at most 40 characters"), {
      error: "Tags must be a list",
    })
    .max(20, "At most 20 tags")
    .optional(),
  batches: z.array(batchSchema, { error: "Batches must be a list" }).max(50).optional(),
  syllabus: z.array(moduleSchema, { error: "Syllabus must be a list" }).max(100).optional(),
};

const createCourseSchema = z.object(courseFields);

const updateCourseSchema = z
  .object(courseFields)
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: "Nothing to update" });

module.exports = { createCourseSchema, updateCourseSchema };
