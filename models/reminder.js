// models/reminder.js
const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema({
  body: String,
  dateTime: Date,
});

const Reminder = mongoose.model("Reminder", reminderSchema);

module.exports = Reminder;
