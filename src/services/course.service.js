// service to handle course-related operations

const Course = require("../models/Course");
const isObjectId = require("../utils/isObjectId");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCourses = async (query) => {
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

  return {
    courses,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
  };
};

const getCourseById = async (id) => {
  if (!isObjectId(id)) throw new Error("Course not found");
  const course = await Course.findById(id);
  if (!course) throw new Error("Course not found");
  return course;
};

module.exports = { getCourses, getCourseById };
