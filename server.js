// --------------------------------------------------------------------------------
// serve(r)
// idk how much of this we actually need i just wanted to test push something!
// --------------------------------------------------------------------------------

// pasted from lookup assignment
// standard modules, loaded from node_modules
const path = require('path');
require("dotenv").config({ path: path.join(process.env.HOME, '.cs304env')});
const express = require('express');
const morgan = require('morgan');
const serveStatic = require('serve-static');
const bodyParser = require('body-parser');
const cookieSession = require('cookie-session');

// our modules loaded from cwd
const { Connection } = require('./connection');
const cs304 = require('./cs304');

// create and configure the app
const app = express();

// Morgan reports the final status code of a request's response
app.use(morgan('tiny'));
app.use(cs304.logStartRequest);

// This handles POST data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(cs304.logRequestData);  // tell the user about any request data

app.use(serveStatic('public'));
app.set('view engine', 'ejs');

const mongoUri = cs304.getMongoUri();

// --------------------------------------------------------------------------------