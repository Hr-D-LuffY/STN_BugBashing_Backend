const AssignmentSubmission = require("../models/AssignmentSubmission");
const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");
const isObjectId = require("../utils/isObjectId");

const MAX_ANSWER_LENGTH = 5000;

const isHttpUrl = (text) => {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// the lesson with this id, or null if it is not in the course
const findLesson = (course, lessonId) => {
  for (const mod of course.syllabus) {
    const lesson = mod.lessons.id(lessonId);
    if (lesson) return lesson;
  }
  return null;
};

const submitAssignment = async (studentId, payload) => {
  const { courseId, lessonId, answerType } = payload;

  if (!isObjectId(courseId)) throw new Error("Invalid course id");
  if (!isObjectId(lessonId)) throw new Error("Invalid lesson id");
  if (answerType !== "text" && answerType !== "link") {
    throw new Error('answerType must be "text" or "link"');
  }

  const answer = typeof payload.answer === "string" ? payload.answer.trim() : "";
  if (!answer) throw new Error("Answer cannot be empty");
  if (answer.length > MAX_ANSWER_LENGTH) {
    throw new Error(`Answer must be at most ${MAX_ANSWER_LENGTH} characters`);
  }
  if (answerType === "link" && !isHttpUrl(answer)) {
    throw new Error("Link must be a valid http or https URL");
  }

  // ensure student enrolled
  const enrolled = await Enrollment.findOne({ student: studentId, course: courseId });
  if (!enrolled) throw new Error("You are not enrolled in this course");

  // the lesson must belong to this course and actually have an assignment
  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");
  const lesson = findLesson(course, lessonId);
  if (!lesson || !lesson.assignmentPrompt) {
    throw new Error("This lesson has no assignment in this course");
  }

  // one submission per student and lesson
  const existing = await AssignmentSubmission.findOne({
    student: studentId,
    course: courseId,
    lessonId,
  });
  if (existing) throw new Error("You have already submitted this assignment");

  const submission = await AssignmentSubmission.create({
    student: studentId,
    course: courseId,
    lessonId,
    answerType,
    answer,
  });

  return submission;
};

const getMySubmissions = async (studentId, courseId = null) => {
  const filter = { student: studentId };
  if (courseId) filter.course = courseId;

  const submissions = await AssignmentSubmission.find(filter)
    .populate("course", "title")
    .populate("reviewer", "name")
    .sort({ createdAt: -1 });

  // a deleted course leaves no entry behind
  return submissions.filter((submission) => submission.course);
};

// Get assignment statistics for a course
const getAssignmentStats = async (studentId, courseId) => {
  const submissions = await AssignmentSubmission.find({
    student: studentId,
    course: courseId,
  })
    .populate("reviewer", "name")
    .sort({ createdAt: -1 });

  if (submissions.length === 0) {
    return {
      average: 0,
      totalAssignments: 0,
      reviewedCount: 0,
      submissions: [],
    };
  }

  // Calculate average from graded assignments only
  const gradedSubmissions = submissions.filter((s) => s.grade !== null && s.grade !== undefined);
  const average = gradedSubmissions.length > 0
    ? Math.round(gradedSubmissions.reduce((sum, s) => sum + s.grade, 0) / gradedSubmissions.length)
    : 0;

  return {
    average,
    totalAssignments: submissions.length,
    reviewedCount: submissions.filter((s) => s.status === "reviewed").length,
    submissions: submissions.map((s) => ({
      _id: s._id,
      lessonId: s.lessonId,
      answer: s.answer,
      answerType: s.answerType,
      status: s.status,
      grade: s.grade,
      reviewNotes: s.reviewNotes,
      reviewer: s.reviewer,
      submittedAt: s.createdAt,
      reviewedAt: s.updatedAt,
    })),
  };
};

module.exports = { submitAssignment, getMySubmissions, getAssignmentStats };
