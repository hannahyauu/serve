// ==========================================================================
// serve(r)
// ==========================================================================

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
const flash = require('express-flash');

// logins using bcrypt
const bcrypt = require('bcrypt');
const ROUNDS = 10;

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

app.use(flash()); // flashing
app.use(serveStatic('public'));
app.use('/data', express.static('data'));
app.set('view engine', 'ejs');

const mongoUri = cs304.getMongoUri();

// took this from passwords example app?? does this work...
app.use(cookieSession({
  name: 'session',
  keys: [cs304.randomString(20)],
  expires: 0, // expires when tab/browser closed
  secure: false // for testing on localhost
}));

// ==========================================================================

// Gets all recipes in serve DB
async function getAllRecipes() {
    const db = await Connection.open(mongoUri, 'serve');
    return db.collection('recipes').find({}).toArray();
}

// Finds all ingredients with single ingredient in ingredient list
async function recipesByIngredient(ingredient) {
    const recipes = await getAllRecipes();
    const filter = recipes.filter(recipe =>
        recipe.cleanedIngredients.map(item =>
            item.toLowerCase().includes(ingredient.toLowerCase())
        )
    );
    return filter
}

async function getCurrentInventory(){
    // need to use cookies to get persons info and see what db they're connected to.
}

// function filterRecipes() {
//     let input = document.getElementById('recipeSearch');
//     let filter = input.value.toLowerCase();
//     let ul = document.
// }

// ==========================================================================

// main page. just has links to two other pages
app.get('/', (req, res) => {
    return res.render('index.ejs');
});

// recipe pages
app.get('/recipes/', async (req, res) => {
    const searchInput = req.query.searchInput;
    const recipes = await getAllRecipes();

    let filteredRecipes = recipes;

    if (searchInput) {
        const search = searchInput.toLowerCase();

        filteredRecipes = recipes.filter(recipe => {
            const title = (recipe.title || '').toLowerCase();

            return recipe.cleanedIngredients.some(ingredient =>
                ingredient.toLowerCase().includes(search)
            ) || title.includes(search);
        });
    }

    return res.render('recipes.ejs', { recipes: filteredRecipes });
});

// for search
app.get('/recipes/:ingredients', async (req, res) => {
    const ingredient = req.params.ingredients;
    const result = recipesByIngredient(ingredient);

    return res.render('recipes.ejs',
                        {recipe: result});
});

// app.post('/recipes/:search', async (req, res) => {
//     const searchInput = req.params.search;

//     const searchresults = recipesByIngredient(searchInput);
//     console.log(searchresults);
    
//     return res.render('recipes.ejs');
// });

// ==========================================================================

// inventory pages
const storageLocations = ['fridge', 'freezer', 'pantry'];
const testIngredients = [{name: "apple", imgFile: "Apple.png", expiration: "04-22-26", amount: 2},
                         {name: "peach", imgFile: "Peach.png", expiration: "04-12-26", amount: 5},
                         {name: "eggs", imgFile: "Eggs.png", expiration: "04-30-26", amount: 12}
                        ];

// renders inventory page
app.get('/inventory/:location', requiresLogin, (req, res) => {
    const location = req.params.location;
    return res.render('inventory.ejs', {locations: storageLocations, ingredients: testIngredients});
});

app.post('/add-item', requiresLogin, async (req, res) => {
    const db = await Connection.open(mongoUri, 'serve');
    // this isn't done lol 
})



// ==========================================================================

// profile page
app.get('/profile', requiresLogin, (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    return res.render('profile.ejs', { username: req.session.username });
});

// password/login stuff
const USERS = 'users';

function requiresLogin(req, res, next) {
    if (!req.session.loggedIn) {
        req.flash('error', 'this page requires you to be logged in.');
        return res.redirect("/");
    } else {
        next();
    }
};

// renders log in/register page
app.get('/login', async (req, res) => { 
    return res.render('login.ejs');
});

// process sign up form submission: creates user in users collection
app.post('/signup', async (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;
        const hash = await bcrypt.hash(password, ROUNDS);
        
        const db = await Connection.open(mongoUri, 'serve');

        // if username already exists, flash error message
        let existingUser = await db.collection(USERS).findOne({username: username});
        if (existingUser) {
        req.flash('error', "login already exists. please try logging in instead.");
        return res.redirect('/login');
        }

        // otherwise insert a new user
        await db.collection(USERS).insertOne({
            username: username,
            hash: hash
        });

        // on successful registration, create session with given username
        req.flash('info', 'successfully joined and logged in as ' + username);
        req.session.username = username;
        req.session.loggedIn = true;
        
        return res.redirect('/inventory/fridge');
    
    } catch (error) {
        req.flash('error', `form submission error: ${error}`);
        return res.redirect('/')
    }
});

// process login form submission
app.post("/login", async (req, res) => {
    try {
        const username = req.body.username;
        const password = req.body.password;
        
        const db = await Connection.open(mongoUri, 'serve');
        let existingUser = await db.collection(USERS).findOne({username: username});

        if (!existingUser) {
            req.flash('error', "username does not exist.");
            return res.redirect('/')
        }
        const match = await bcrypt.compare(password, existingUser.hash); 
        
        if (!match) {
            req.flash('error', "username or password incorrect.");
            return res.redirect('/login')
        }
        req.flash('info', 'successfully logged in as ' + username);
        req.session.username = username;
        req.session.loggedIn = true;

        return res.redirect('/inventory/fridge');
    
    } catch (error) {
        req.flash('error', `form submission error: ${error}`);
        return res.redirect('/');
    }
});

// log out if currently logged in, flashes error otherwise
app.post('/logout', (req, res) => {
    if (req.session.username) {
        req.session.username = null;
        req.session.loggedIn = false;
        req.flash('info', 'you are logged out');
        return res.redirect('/');
    } else {
        req.flash('error', 'you are not logged in.');
        return res.redirect('/');
    }
});

// ==========================================================================

const serverPort = cs304.getPort(8080);

// this is last, because it never returns
app.listen(serverPort, function() {
    console.log(`listening on ${serverPort}`);
    console.log(`visit http://cs.wellesley.edu:${serverPort}/`);
    console.log(`or http://localhost:${serverPort}/`);
    console.log('^C to exit');
});
