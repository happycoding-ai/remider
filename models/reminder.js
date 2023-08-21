// models/reminder.js
const mongoose = require("mongoose");

const reminderSchema = new mongoose.Schema({
  taskName: String,
  taskTime: String,
  taskTimeOG: String,
  clientNumber: String,
});

reminderSchema.plugin(encrypt, {
  encryptionKey: encKey,
  signingKey: sigKey,
  encryptedFields: ["taskName"],
});

const Reminder = mongoose.model("Reminder", reminderSchema);

module.exports = Reminder;
