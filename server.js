require('dotenv').config();
const express = require("express");
const twilio = require("twilio");
const mongoose = require("mongoose");
const encrypt = require("mongoose-encryption");
const bodyParser = require('body-parser');
const _ = require("lodash");
const cron = require("node-cron");
const moment = require("moment-timezone");
const app = express();
const { extractClientNumber, sendMessage, testInput } = require("./utils/utils.js");

const SID = process.env.SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
if(process.env.USE_TWILIO != "no") {
    client = new twilio(SID, AUTH_TOKEN);
}

const sugar = require('sugar')

const winkNLP = require( 'wink-nlp' );
const model = require( 'wink-eng-lite-web-model' );
const nlp = winkNLP( model );
const its = nlp.its;
const as = nlp.as;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Connecting to database
mongoose.connect(process.env.DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })

var encKey = process.env.SOME_32BYTE_BASE64_STRING;
var sigKey = process.env.SOME_64BYTE_BASE64_STRING;

// Database schema
const reminderSchema = new mongoose.Schema({
    taskName: String,
    taskTime: String,
    taskTimeOG: String,
    clientNumber: String
});

//reminderSchema.plugin(encrypt, {
  //  encryptionKey: encKey,
  //  signingKey: sigKey,
  //  encryptedFields: ['taskName']
//});
const Reminder = mongoose.model('Reminder', reminderSchema);

// Searches the database for reminders per minute
cron.schedule('* * * * *', () => {
    console.log("Checking database...");
    const isoString = new Date().toISOString();
    const currTime = moment.tz(isoString, "Asia/Singapore").format().slice(0, 16);
    console.log(currTime);
    Reminder.find({ taskTime: currTime }, (err, tasks) => {
        if (err) {
            console.log(err);
        } else {

            // Creating a throttled function that sends messages slowly
            var throttledFunction = _.throttle((task) => {
                if(process.env.USE_TWILIO != "no") {
                    client.messages
                        .create({
                            body: `Your Reminder *${task.taskName}*.`,
                            from: "whatsapp:" + process.env.SERVER_NUMBER,
                            to: "whatsapp:" + task.clientNumber
                        }, (err, response) => {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log(`Sent a message!`+ response);
                            }
                        }).then(message => console.log(message));
                } else {
                    console.log("[REMINDER SENT]", task.taskName);
                }
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
app.post("/incoming", (req, res) => {
    const clientNumber = extractClientNumber(req.body.From);

    // View Reminders
    if (_.lowerCase(req.body.Body.split(' ')[0]) === "view") {
        console.log("view");
        Reminder.find(
            { clientNumber: clientNumber },
            (err, foundTasks) => {
                if (err) {
                    console.log(err);
                } else if (foundTasks.length) {
                    const upcomingTasks = [];
                    foundTasks.forEach((task) => {
                        var subMessage = `*${task.taskName}* at *${task.taskTimeOG}*`;
                        upcomingTasks.push(subMessage);
                    });
                    sendMessage(upcomingTasks.join('\n'), res);
                } else if (!foundTasks.length) {
                    sendMessage("You don't have any upcoming tasks. Create some first. To know how to create type *set* to get insight.", res);
                }
            }
        );
        return;
    } 

    const sentence = req.body.Body;
    const doc = nlp.readDoc(sentence);
    const entities = doc.entities().out(its.detail);
    const date_entity = entities.find(e => e.type == 'DATE')?.value;
    const time_entity = entities.find(e => e.type == 'TIME')?.value;

    if(date_entity == undefined && time_entity == undefined) {
        sendMessage("I don't know what that means.", res);
        return
    }

    const taskName = sentence.replace(date_entity, '').replace(time_entity, '').trim();
    const taskTime = sugar.Date(date_entity +" "+ time_entity)?.raw;
    if(isNaN(taskTime)) {
        sendMessage("Please write your date and time properly", res);
        return;
    }

    if(new Date >= taskTime) {
        sendMessage("Provided date time is old", res);
        return;
    }

    
    // Creating reminders
    const isoString = moment.tz(taskTime.toISOString(), "Asia/Kolkata").format();
    console.log(`Reminder created for: ${taskTime}`);
    const taskInfo = new Reminder({
        taskName: taskName,
        taskTime: isoString,
        taskTimeOG: taskTime.toDateString().slice(0, 16) + " at " + taskTime.toTimeString().slice(0, 5),
        clientNumber: clientNumber
    });
    taskInfo.save((err) => {
        if (err) {
            console.log(err)
        } else {
            sendMessage(`Ok, will remind about *${taskName}*`, res);
        }
    });
});

app.get("/", (req, res) => {
    res.send("Hi! You've just found the server of Reminder. Welcome");
});

app.listen(process.env.PORT || 3070, () => {
    console.log("Server started.");
});
