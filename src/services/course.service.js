// service to handle course-related operations

const Course = require("../models/Course");
const Enrollment = require("../models/Enrollment");
const isObjectId = require("../utils/isObjectId");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// How much of a course's syllabus the caller may see:
//   "full"    - admins (everything, including quiz answers, to edit the course)
//   "student" - enrolled students (lessons and quiz questions, but no quiz answers)
//   "outline" - everyone else (module and lesson titles only)
const shapeCourse = (course, access) => {
  const data = course.toObject();
  if (access === "full") return data;

  data.syllabus = (data.syllabus || []).map((mod) => ({
    ...mod,
    lessons: (mod.lessons || []).map((lesson) => {
      if (access !== "student") return { _id: lesson._id, title: lesson.title };
      return {
        ...lesson,
        quiz: (lesson.quiz || []).map(({ correctIndex, ...question }) => question),
      };
    }),
  }));
  return data;
};

const getAccess = async (user, courseId) => {
  if (!user) return "outline";
  if (user.role === "admin") return "full";
  const enrolled = await Enrollment.exists({ student: user.id, course: courseId });
  return enrolled ? "student" : "outline";
};

const getCourses = async (query, user) => {
  const {
    page = 1,
    limit = 8,
    search = "",
    sort = "",
    category,
    tags,
  } = query;

  // Validate and sanitize pagination parameters
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 8)); // Max 100 items per page

  const filter = {};

  if (search && typeof search === "string") {
    // treat the search text literally, not as a regular expression
    const pattern = escapeRegex(search.trim());
    filter.$or = [
      { title: { $regex: pattern, $options: "i" } },
      { instructorName: { $regex: pattern, $options: "i" } },
    ];
  }

  if (category && typeof category === "string") {
    filter.category = category;
  }

  if (tags && typeof tags === "string") {
    const tagArray = tags.split(",").map(t => t.trim()).filter(t => t); // "mern,react"
    if (tagArray.length > 0) {
      filter.tags = { $in: tagArray };
    }
  }

  let sortObj = {};
  if (sort === "price_asc") sortObj.price = 1;
  if (sort === "price_desc") sortObj.price = -1;

  const skip = (pageNum - 1) * limitNum;

  const [courses, total] = await Promise.all([
    Course.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum),
    Course.countDocuments(filter),
  ]);

  // the list only needs the outline (titles and counts), except for admins
  const isAdmin = user?.role === "admin";

  return {
    courses: courses.map((course) => shapeCourse(course, isAdmin ? "full" : "outline")),
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  };
};

const getCourseById = async (id, user) => {
  if (!isObjectId(id)) throw new Error("Course not found");
  const course = await Course.findById(id);
  if (!course) throw new Error("Course not found");
  return shapeCourse(course, await getAccess(user, course._id));
};

module.exports = { getCourses, getCourseById };
