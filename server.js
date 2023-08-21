require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const _ = require("lodash");
const cron = require("node-cron");
const moment = require("moment-timezone");
const { parse } = require("date-fns");
const {
  sendMessage,
  extractClientNumber,
  testInput,
} = require("./utils/utils");
const app = express();
const Reminder = require("./models/reminder"); // Adjust the path accordingly
const SID = process.env.SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const client = new twilio(SID, AUTH_TOKEN);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Connecting to database
mongoose
  .connect(process.env.DB_URI)
  .then(() => console.log("Connected to the database..."))
  .catch((err) => console.log("Error connecting to the database: ", err));

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
  const clientNumber = extractClientNumber(req.body.From); // Extract client number

  const requestBody = req.body.Body.toLowerCase();

  const query = requestBody.split(" ");
  const action = _.lowerCase(query[0]);

  // Handle cancel action
  if (action === "cancel") {
    const reminderToDelete = query.slice(1).join(" ");
    Reminder.deleteOne({ taskName: reminderToDelete }, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
      }
      return res.status(200).json({ message: "Reminder deleted successfully" });
    });
  }

  // Handle set action
  if (action === "set") {
    const timeIndex = query.findIndex((word) =>
      word.match(/\d{1,2}(?:am|pm)?/)
    );

    if (timeIndex === -1) {
      return res.status(400).json({ error: "Invalid input format" });
    }

    const taskName = query.slice(1, timeIndex).join(" ");

    const time = query[timeIndex];
    const topic = query.slice(timeIndex + 1).join(" ");

    // Validation using testInput function
    if (!testInput(query)) {
      sendMessage(
        "Please enter valid inputs and try again. Possible error: *Inputs not according to specified format* or *Reminder time given in past* (I hope you know time travel isn't possible yet)",
        res
      );
      return;
    }

    // Rest of the code to create a new reminder and save it
    const currentYear = new Date().getFullYear();
    const dateTimeStr = `${month || monthAlt} ${
      dayOfMonth || dayOfMonthAlt
    } ${currentYear} ${time}`;

    const dateTime =
      parse(dateTimeStr, "MMMM dd yyyy h:mmaaa", new Date()) ?? Date.now();

    const now = new Date();

    if (dateTime <= now) {
      return res.status(400).json({ error: "Invalid date and time" });
    }

    const newReminder = new Reminder({
      taskName: topic,
      taskTime: dateTimeStr,
      taskTimeOG: dateTime,
      clientNumber: clientNumber, // Use extracted client number
    });

    newReminder.save((err, reminder) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
      }
      return res.status(200).json({ message: "Reminder created successfully" });
    });
  }

  // Handle view action
  if (action === "view") {
    Reminder.find({ clientNumber: clientNumber }, (err, foundTasks) => {
      if (err) {
        console.log(err);
        return res.status(500).json({ error: "Internal server error" });
      } else if (foundTasks.length) {
        const upcomingTasks = foundTasks.map((task) => {
          return `*${task.taskName}* at *${task.taskTimeOG}*`;
        });
        sendMessage(upcomingTasks.join("\n"), res);
      } else {
        sendMessage(
          "You don't have any upcoming tasks. Create some first. To know how to create type *set* to get insight.",
          res
        );
      }
    });
  }

  // Handle unknown action
  if (!["cancel", "set", "view"].includes(action)) {
    sendMessage("I don't know what that means. Try *set* or *view*", res);
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started.");
});
