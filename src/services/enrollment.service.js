const mongoose = require("mongoose");
const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");

const enrollCourse = async (studentId, courseId, batchId = null) => {
  const course = await Course.findById(courseId);
  if (!course) throw new Error("Course not found");

  // Check if already enrolled
  let enrollment = await Enrollment.findOne({
    student: studentId,
    course: courseId,
  });

  if (enrollment) {
    throw new Error("Already enrolled in this course");
  }

  // Create new enrollment
  enrollment = await Enrollment.create({
    student: studentId,
    course: courseId,
    batchId,
    progress: { completedLessons: [], percent: 0 },
  });

  return enrollment;
};

const getMyEnrollments = async (studentId) => {
  return Enrollment.find({ student: studentId })
    .populate("course", "title instructorName price category tags")
    .sort({ createdAt: -1 });
};

const completeLesson = async (studentId, enrollId, lessonId) => {
  if (!mongoose.isValidObjectId(enrollId) || !mongoose.isValidObjectId(lessonId)) {
    throw new Error("Invalid enrollment or lesson id");
  }

  // only the owner of the enrollment may update it
  const enrollment = await Enrollment.findOne({ _id: enrollId, student: studentId });
  if (!enrollment) throw new Error("Enrollment not found");

  const course = await Course.findById(enrollment.course);
  if (!course) throw new Error("Course not found");

  const lessonIds = course.syllabus.flatMap((mod) =>
    mod.lessons.map((lesson) => String(lesson._id))
  );
  if (!lessonIds.includes(String(lessonId))) {
    throw new Error("Lesson not found in this course");
  }

  // avoid duplicates
  const alreadyDone = enrollment.progress.completedLessons
    .map(String)
    .includes(String(lessonId));

  if (!alreadyDone) {
    enrollment.progress.completedLessons.push(lessonId);
  }

  // calculate percent
  const completed = enrollment.progress.completedLessons.length;
  enrollment.progress.percent =
    lessonIds.length === 0 ? 0 : Math.round((completed / lessonIds.length) * 100);

  await enrollment.save();
  return enrollment;
};

module.exports = { enrollCourse, getMyEnrollments, completeLesson };
