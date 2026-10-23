const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const QuizSubmission = require("../models/QuizSubmission");
const isObjectId = require("../utils/isObjectId");

// the quiz questions of one lesson, or null if the lesson is not in the course
const findLessonQuiz = (course, lessonId) => {
  for (const mod of course.syllabus) {
    const lesson = mod.lessons.id(lessonId);
    if (lesson) return lesson.quiz || [];
  }
  return null;
};

const submitQuiz = async (studentId, payload) => {
  const { courseId, lessonId, answers } = payload;
  // answers = [selectedIndex, selectedIndex, ...]
  if (!Array.isArray(answers)) throw new Error("answers must be an array");
  if (!isObjectId(courseId)) throw new Error("Invalid course id");
  if (!isObjectId(lessonId)) throw new Error("Invalid lesson id");

  const enrolled = await Enrollment.findOne({ student: studentId, course: courseId });
  if (!enrolled) throw new Error("You are not enrolled in this course");

  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");

  // find lesson quiz
  const quiz = findLessonQuiz(course, lessonId);
  if (!quiz) throw new Error("Lesson not found");
  if (quiz.length === 0) throw new Error("No quiz in this lesson");

  // exactly one answer per question, each one of the question's options
  if (answers.length !== quiz.length) {
    throw new Error(`Answer all ${quiz.length} questions (received ${answers.length})`);
  }
  answers.forEach((answer, i) => {
    const optionCount = quiz[i].options.length;
    if (!Number.isInteger(answer) || answer < 0 || answer >= optionCount) {
      throw new Error(`Answer ${i + 1} must be a whole number from 0 to ${optionCount - 1}`);
    }
  });

  let score = 0;
  quiz.forEach((q, i) => {
    if (answers[i] === q.correctIndex) score++;
  });

  const total = quiz.length;
  const percent = Math.round((score / total) * 100);

  // Check if student already submitted this quiz (optional - allow retakes)
  // If you want to prevent duplicates, uncomment the following:
  // const existing = await QuizSubmission.findOne({
  //   student: studentId,
  //   course: courseId,
  //   lessonId,
  // });
  // if (existing) {
  //   throw new Error("You have already submitted this quiz");
  // }

  // Save quiz submission to database
  const submission = await QuizSubmission.create({
    student: studentId,
    course: courseId,
    lessonId,
    answers,
    score,
    total,
    percent,
  });

  // Verify it was saved
  if (!submission || !submission._id) {
    throw new Error("Failed to save quiz submission");
  }

  return {
    _id: submission._id,
    total,
    score,
    percent,
    createdAt: submission.createdAt,
    // revealed only now that the attempt is saved
    correctAnswers: quiz.map((q) => q.correctIndex),
  };
};

// Get quiz submissions for a student in a specific course
const getMyQuizSubmissions = async (studentId, courseId = null) => {
  if (courseId && !isObjectId(courseId)) throw new Error("Invalid course id");
  const filter = { student: studentId };
  if (courseId) filter.course = courseId;

  const submissions = await QuizSubmission.find(filter)
    .populate("course", "title")
    .sort({ createdAt: -1 });

  // for a single course, attach the right answers of each submitted quiz so
  // the player can show a review (the course API never sends them)
  if (!courseId) return submissions;
  const course = await Course.findById(courseId);
  return submissions.map((submission) => {
    const data = submission.toObject();
    data.correctAnswers = course
      ? (findLessonQuiz(course, submission.lessonId) || []).map((q) => q.correctIndex)
      : [];
    return data;
  });
};

// Get quiz statistics for a course
const getQuizStats = async (studentId, courseId) => {
  const submissions = await QuizSubmission.find({
    student: studentId,
    course: courseId,
  }).sort({ createdAt: -1 }); // Get most recent first

  if (submissions.length === 0) {
    return {
      average: 0,
      totalQuizzes: 0,
      submissions: [],
    };
  }

  // Group by lessonId and get only the most recent submission per lesson
  const latestSubmissions = {};
  submissions.forEach((sub) => {
    const lessonIdStr = String(sub.lessonId);
    if (!latestSubmissions[lessonIdStr] ||
      new Date(sub.createdAt) > new Date(latestSubmissions[lessonIdStr].createdAt)) {
      latestSubmissions[lessonIdStr] = sub;
    }
  });

  const uniqueSubmissions = Object.values(latestSubmissions);
  const totalPercent = uniqueSubmissions.reduce((sum, s) => sum + s.percent, 0);
  const average = Math.round(totalPercent / uniqueSubmissions.length);

  return {
    average,
    totalQuizzes: uniqueSubmissions.length,
    submissions: uniqueSubmissions.map((s) => ({
      _id: s._id,
      lessonId: s.lessonId,
      score: s.score,
      total: s.total,
      percent: s.percent,
      submittedAt: s.createdAt,
    })),
  };
};

module.exports = { submitQuiz, getMyQuizSubmissions, getQuizStats };
