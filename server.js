// --------------------------------------------------------------------------------
// serve(r)
// --------------------------------------------------------------------------------

// pasted from lookup assignment
// standard modules, loaded from node_modulesconst path = require('path');
const fs = require('fs');
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

// Gets all recipes in serve DB
async function getAllRecipes() {
    const db = await Connection.open(mongoUri, 'serve');
    return db.collection('recipes').find({}).toArray();
}

// --------------------------------------------------------------------------------

// main page. just has links to two other pages
app.get('/', (req, res) => {
    return res.render('index.ejs');
});

// recipe pages
<<<<<<< HEAD
app.get('/recipes/', async (req, res) => {
    const recipes = await getAllRecipes();
    // console.log(recipes);
    // let recipes = 
    return res.render('recipes.ejs',
                        {recipes: recipes});
=======
app.get('/recipes/', (req, res) => {
    // hello
    console.log("hi");
    return res.render('recipes.ejs');
>>>>>>> 9df207cc80c91185eaeabc828f9b87f6d688daca
});

app.get('/recipes/:ingredients', (req, res) => {
    return res.render('recipes.ejs',
                        {recipe: recipe});
});

// inventory pages
const storageLocations = ['fridge', 'freezer', 'pantry'];
const testIngredients = [{name: "apple", image: "apple.jpeg", expiration: "04-22-26", type: "fruit", amount: 2},
                         {name: "pear", image: "pear.jpeg", expiration: "04-12-26", type: "fruit", amount: 5},
                         {name: "eggs", image: "eggs.jpeg", expiration: "04-30-26", type: "poultry", amount: 12}
                        ];

app.get('/inventory', (req, res) => {
    return res.render('inventory.ejs', {locations: storageLocations, ingredients: testIngredients});
});

const serverPort = cs304.getPort(8080);

// --------------------------------------------------------------------------------

// this is last, because it never returns
app.listen(serverPort, function() {
    console.log(`listening on ${serverPort}`);
    console.log(`visit http://cs.wellesley.edu:${serverPort}/`);
    console.log(`or http://localhost:${serverPort}/`);
    console.log('^C to exit');
});
