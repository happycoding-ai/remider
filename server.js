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

// Handles incoming messages
// app.post('/incoming', (req, res) => {
//   console.log(req);
//   const query = req.body.Body.split(' ');
//   const clientNumber = extractClientNumber(req.body.From);
//   const action = _.lowerCase(query[0]);

//   // Creating reminders
//   if (action === 'set') {
//     // Send instructions
//     if (!query[1]) {
//       sendMessage(
//         'Format: \n *set* _task(required, no spaces)_ _time(required, in HHMM format)_ _date(optional, in DD/MM format, default is today)_',
//         res
//       );
//     } else {
//       const taskName = query[1];
//       const time = query[2];
//       var hours = parseInt(time.slice(0, 2));
//       var minutes = parseInt(time.slice(2, 4));
//       var year = new Date().getUTCFullYear();

//       // For today
//       if (!query[3] || query[3] === 'today') {
//         if (testInput(query)) {
//           const istString = moment
//             .tz(new Date().toISOString(), 'Asia/Kolkata')
//             .format()
//             .slice(0, 16);
//           var month = istString.slice(5, 7);
//           var date = istString.slice(8, 10);
//           const isoString = new Date(
//             year,
//             month - 1,
//             date,
//             hours,
//             minutes,
//             0,
//             0
//           ).toISOString();
//           const taskTime = isoString.slice(0, 16);
//           console.log(`Reminder created for: ${taskTime}`);
//           const taskInfo = new Reminder({
//             taskName: taskName,
//             taskTime: taskTime,
//             taskTimeOG:
//               new Date(year, month - 1, date, hours, minutes, 0, 0)
//                 .toDateString()
//                 .slice(0, 16) +
//               ' at ' +
//               new Date(year, month - 1, date, hours, minutes, 0, 0)
//                 .toTimeString()
//                 .slice(0, 5),
//             clientNumber: clientNumber,
//           });
//           taskInfo.save((err) => {
//             if (err) {
//               console.log(err);
//             } else {
//               sendMessage(`Ok, will remind about *${taskName}*`, res);
//             }
//           });
//         } else {
//           sendMessage(
//             "Please enter valid inputs and try again. Possible error: *Inputs not according to specified format* or *Reminder time given in past* (I hope you know time travel isn't possible yet)",
//             res
//           );
//         }
//       }

//       // For any day
//       else {
//         if (testInput(query)) {
//           const dateMonthString = query[3];
//           var date = parseInt(dateMonthString.split('/')[0]);
//           var month = parseInt(dateMonthString.split('/')[1]) - 1;
//           const isoString = new Date(
//             year,
//             month,
//             date,
//             hours,
//             minutes,
//             0,
//             0
//           ).toISOString();
//           const taskTime = isoString.slice(0, 16);
//           console.log(`Reminder created for *${taskTime}*`);
//           const taskInfo = new Reminder({
//             taskName: taskName,
//             taskTime: taskTime,
//             taskTimeOG:
//               new Date(year, month, date, hours, minutes, 0, 0)
//                 .toDateString()
//                 .slice(0, 16) +
//               ' at ' +
//               new Date(year, month, date, hours, minutes, 0, 0)
//                 .toTimeString()
//                 .slice(0, 5),
//             clientNumber: clientNumber,
//           });
//           taskInfo.save((err) => {
//             if (err) {
//               console.log(err);
//             } else {
//               sendMessage(`Ok, will remind you about *${taskName}*`, res);
//             }
//           });
//         } else {
//           sendMessage(
//             "Please enter valid inputs and try again. Possible error: *Inputs not according to specified format* or *Reminder time given in past* (I hope you know time travel isn't possible yet)",
//             res
//           );
//         }
//       }
//     }
//   }

//   // View reminders
//   else if (action === 'view') {
//     console.log('view');
//     Reminder.find({ clientNumber: clientNumber }, (err, foundTasks) => {
//       if (err) {
//         console.log(err);
//       } else if (foundTasks.length) {
//         const upcomingTasks = [];
//         foundTasks.forEach((task) => {
//           var subMessage = `*${task.taskName}* at *${task.taskTimeOG}*`;
//           upcomingTasks.push(subMessage);
//         });
//         sendMessage(upcomingTasks.join('\n'), res);
//       } else if (!foundTasks.length) {
//         sendMessage(
//           "You don't have any upcoming tasks. Create some first. To know how to create type *set* to get insight.",
//           res
//         );
//       }
//     });
//   } else {
//     sendMessage("I don't know what that means. Try *set* or *view*", res);
//   }
// });

app.post("/incoming", (req, res) => {
  const requestBody = req.body.Body.toLowerCase(); // Convert to lowercase for easier matching

  if (requestBody.startsWith("cancel")) {
    // Delete the record
    const reminderToDelete = requestBody.substring(7).trim(); // Remove 'cancel' and trim
    Reminder.deleteOne({ body: reminderToDelete }, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
      }
      return res.status(200).json({ message: "Reminder deleted successfully" });
    });
  } else {
    // Parse and handle new reminder
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
      // If time doesn't specify am/pm, ask the user
      // TODO: implement this as a prompt or user interaction
      // For simplicity, we'll assume PM if no am/pm is provided
      time += "pm";
    }

    const topic = requestBody
      .replace(dateMatch[0], "")
      .replace(timeMatch[0], "")
      .trim();

    const currentYear = new Date().getFullYear(); // Get the current year

    // Construct a date-time string in a format compatible with date-fns
    const dateTimeStr = `${currentYear}-${month || monthAlt}-${
      dayOfMonth || dayOfMonthAlt
    }`;
    // Create a Date object using the date-time string
    // const dateTime = new Date(dateTimeStr);
    const dateTime = parse(dateTimeStr, "MMMM dd yyyy", new Date());

    // Check if the dateTime is valid and not in the past
    const now = new Date();

    if (dateTime <= now) {
      return res.status(400).json({ error: "Invalid date and time" });
    }

    // Create a new Reminder document and save it
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

app.get("/", (req, res) => {
  res.send("Hi! You've just found the server of Rebot. Welcome");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started.");
});
