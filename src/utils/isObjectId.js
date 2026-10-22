// strict check for a 24-character hex MongoDB ObjectId string

const isObjectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

module.exports = isObjectId;
