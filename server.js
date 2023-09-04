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
const { sendMessage, moreFilterTaskTime } = require("./utils/utils.js");
const asyncHandler = require('express-async-handler')

const SID = process.env.SID;
const AUTH_TOKEN = process.env.AUTH_TOKEN;
if (process.env.USE_TWILIO != "no") {
    client = new twilio(SID, AUTH_TOKEN);
}

const sugar = require('sugar')

const winkNLP = require('wink-nlp');
const model = require('wink-eng-lite-web-model');
const nlp = winkNLP(model);
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
    taskTime: Date,
    taskTimeOG: String,
    mobile: String
});

const clientSchema = new mongoose.Schema({
    mobile: String,
    name: String,
    timezone: String,
    Status: String
});

//reminderSchema.plugin(encrypt, {
//  encryptionKey: encKey,
//  signingKey: sigKey,
//  encryptedFields: ['taskName']
//});
const Reminder = mongoose.model('Reminder', reminderSchema);
const ClientInfo = mongoose.model('CleintTB', clientSchema);

// Searches the database for reminders per minute
cron.schedule('* * * * *', () => {
    console.log("Checking database...");
    const currTime = new Date();
    console.log(currTime);
    Reminder.find({ taskTime: { $lte: currTime } }, (err, tasks) => {
        if (err) {
            console.log(err);
        } else {

            // Creating a throttled function that sends messages slowly
            var throttledFunction = _.throttle((task) => {
                if (process.env.USE_TWILIO != "no") {
                    client.messages
                        .create({
                            body: `Your Reminder *${task.taskName}*.`,
                            from: "whatsapp:" + process.env.SERVER_NUMBER,
                            to: "whatsapp:" + task.mobile
                        }, (err, response) => {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log(`Sent a message!` + response);
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

app.post("/save", (req, res) => {
    const mobile = req.body.mobile;
    const name = req.body.name;
    const timezone = req.body.timezone;
    const status = req.body.status;

    if (mobile == undefined || name == undefined || timezone == undefined) {
        sendMessage(`mobile, name, timezone is missing`, res);
        return
    }

    const clientInfo = new ClientInfo({
        mobile,
        name,
        timezone,
        status
    });

    clientInfo.save((err) => {
        if (err) {
            console.log(err)
        } else {
            sendMessage(`Save the client information`, res);
        }
    });
});

// Handles incoming messages
app.post("/incoming", asyncHandler(async (req, res) => {
    const mobile = req.body.mobile;
    const sentence = req.body.body;
    const clientInfo = await ClientInfo.findOne({ mobile }).exec();

    if (mobile == undefined || sentence == undefined) {
        sendMessage(`mobile, sentence is missing`, res);
        return;
    }

    // View Reminders
    if (_.lowerCase(sentence.split(' ')[0]) === "view") {
        console.log("view");
        Reminder.find(
            { mobile },
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

    const timezoneOffset = moment().tz(clientInfo.timezone).utcOffset() * -1;

    const doc = nlp.readDoc(sentence);
    const entities = doc.entities().out(its.detail);
    let date_entity = entities.find(e => e.type == 'DATE')?.value;
    let time_entity = entities.find(e => e.type == 'TIME')?.value;

    [time_entity, replace_text] = moreFilterTaskTime(time_entity, sentence);
    let taskName = sentence.replace(date_entity, '').replace(replace_text, '').trim();


    if (date_entity == undefined && time_entity == undefined) {
        sendMessage("I don't know what that means. Please check with Help command to create proper reminder.", res);
        return
    } else if (date_entity == undefined && time_entity != undefined) {
        date_entity = "";
    }


    // A small circus is done to create Date Object based on time at user's timezone
    let taskTime = moment(sugar.Date.create(date_entity + " " + time_entity, { fromUTC: true }))
        .add(timezoneOffset, "minutes").toDate();
    console.log(taskTime);
    if (isNaN(taskTime)) {
        sendMessage("Please enter your date and time properly. Ex: Jan 30 at 2am or 30th Jan at 2am", res);
        return;
    }

    if (new Date() >= taskTime) {
        if (!date_entity.includes(taskTime.getFullYear().toString()) &&
            new Date().toDateString() != taskTime.toDateString()) {
            taskTime = moment(taskTime).add(1, "year").toDate();
        } else {
            sendMessage("We cannot set your reminder at old date time.", res);
            return;
        }
    }


    // Creating reminders
    console.log(`Reminder created for: ${taskTime}`);
    const taskInfo = new Reminder({
        taskName,
        taskTime,
        taskTimeOG: taskTime.toDateString().slice(0, 16) + " at " + taskTime.toTimeString().slice(0, 5),
        mobile
    });
    taskInfo.save((err) => {
        if (err) {
            console.log(err)
        } else {
            sendMessage(`Ok, will remind about *${taskName}*`, res);
        }
    });
}));

app.get("/", (req, res) => {
    res.send("Hi! You've just found the server of Reminder. Welcome");
});

app.listen(process.env.PORT || 3070, () => {
    console.log("Server started.");
});
