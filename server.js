require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const mongoose = require("mongoose");
const encrypt = require("mongoose-encryption");
const bodyParser = require("body-parser");
const _ = require("lodash");
const cron = require("node-cron");
const moment = require("moment-timezone");
const app = express();
const Reminder = require("./models/reminder");
const SID = process.env.SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const client = new twilio(SID, AUTH_TOKEN);
const {
  extractClientNumber,
  sendMessage,
  testInput,
} = require("./utils/utils.js");
const { parse } = require("date-fns");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Connecting to database
mongoose
  .connect(process.env.DB_URI)
  .then(() => console.log("connected to db..."))
  .catch((err) => console.log("Error connecting to db: ", err));

var encKey = process.env.SOME_32BYTE_BASE64_STRING;
var sigKey = process.env.SOME_64BYTE_BASE64_STRING;

// Searches the database for reminders per minute
cron.schedule("* * * * *", () => {
  console.log("Checking database...");
  const isoString = new Date().toISOString();
  const currTime = moment.tz(isoString, "Asia/Kolkata").format().slice(0, 16);
  console.log(currTime);
  Reminder.find({ taskTime: currTime }, (err, tasks) => {
    if (err) {
      console.log(err);
    } else {
      // Creating a throttled function that sends messages slowly
      var throttledFunction = _.throttle((task) => {
        client.messages
          .create(
            {
              body: `Here's your reminder for *${task.taskName}* now.`,
              from: "whatsapp:" + process.env.SERVER_NUMBER,
              to: "whatsapp:" + task.clientNumber,
            },
            (err, response) => {
              if (err) {
                console.log(err);
              } else {
                console.log(`Sent a message!` + response);
              }
            }
          )
          .then((message) => console.log(message));
      }, 1000);

      // Calling throttled function to send message
      for (var i = 0; i < tasks.length; i++) {
        throttledFunction(tasks[i]);
      }

      // Removing reminded tasks
      tasks.forEach((task) => {
        task.remove();
      });
    }
  });
  console.log("Search complete");
});

app.post("/incoming", (req, res) => {
  const requestBody = req.body.Body.toLowerCase();

  if (requestBody.startsWith("cancel")) {
    const reminderToDelete = requestBody.substring(7).trim();
    Reminder.deleteOne({ body: reminderToDelete }, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
      }
      return res.status(200).json({ message: "Reminder deleted successfully" });
    });
  } else {
    const dateRegex =
      /(?:next\s*)?([a-z]+)\s*(\d{1,2}(?:st|nd|rd|th)?)|(\d{1,2}(?:st|nd|rd|th)?)\s*([a-z]+)/;
    const timeRegex = /(\d{1,2}(?::\d{2})?\s*(?:am|pm?)?)/;

    const dateMatch = requestBody.match(dateRegex);
    const timeMatch = requestBody.match(timeRegex);

    if (!dateMatch || !timeMatch) {
      return res.status(400).json({ error: "Invalid input format" });
    }

    let [, month, dayOfMonth, dayOfMonthAlt, monthAlt] = dateMatch;
    let [time] = timeMatch;

    if (!time.includes("am") && !time.includes("pm")) {
      // Assume PM if no am/pm is provided
      time += "pm";
    }

    const topic = requestBody
      .replace(dateMatch[0], "")
      .replace(timeMatch[0], "")
      .trim();

    const currentYear = new Date().getFullYear();

    // Rearrange components for better parsing
    const dateTimeStr = `${month || monthAlt} ${
      dayOfMonth || dayOfMonthAlt
    } ${currentYear} ${time}`;

    // Fix the issue with 'dateTime' being null
    const dateTime =
      parse(dateTimeStr, "MMMM dd yyyy h:mmaaa", new Date()) ?? Date.now();

    const now = new Date();

    if (dateTime <= now) {
      return res.status(400).json({ error: "Invalid date and time" });
    }

    const newReminder = new Reminder({
      body: topic,
      dateTime: dateTime,
    });

    newReminder.save((err, reminder) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
      }
      return res.status(200).json({ message: "Reminder created successfully" });
    });
  }
});

app.get("/reminders", (req, res) => {
  Reminder.find({}, (err, reminders) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Internal server error" });
    }

    const fillerWords = ["remind", "me", "on", "to", "at"];

    const markedReminders = reminders.map((reminder) => {
      const words = reminder.body.toLowerCase().split(" ");

      let date = "";
      let time = "";
      let topic = "";
      let remainingWords = "";

      for (let i = 0; i < words.length; i++) {
        const word = words[i];

        if (
          word.endsWith("th") ||
          word.endsWith("st") ||
          word.endsWith("nd") ||
          word.endsWith("rd")
        ) {
          date += word + " ";
        } else if (word.includes(":") || word.match(/^\d+(?:am|pm)$/)) {
          time = word;
          remainingWords = words.slice(i + 1).join(" ");
          break;
        } else if (!fillerWords.includes(word)) {
          topic += word + " ";
        }
      }

      return {
        date: date.trim(),
        time,
        topic: topic.trim(),
        remainingWords,
      };
    });

    return res.status(200).json({ reminders: markedReminders });
  });
});

app.get("/", (req, res) => {
  res.send("Hi! You've just found the server of Rebot. Welcome");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started.");
});
