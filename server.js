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
const { filter } = require('bluebird');

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

// for database access without typos
const USERS = 'users';
const RECIPES = 'recipes';

// took this from passwords example app?? does this work...
app.use(cookieSession({
  name: 'session',
  keys: [cs304.randomString(20)],
  expires: 0, // expires when tab/browser closed
  secure: false // for testing on localhost
}));

// ==========================================================================

/**
 * Gets all recipes in serve DB
 * @returns list of all recipe documents
 */
async function getAllRecipes() {
    const db = await Connection.open(mongoUri, 'serve');
    return db.collection(RECIPES).find({}).toArray();
}


function normalizeFractions(str) {
    return str
        .replace(/½/g, "1/2")
        .replace(/¼/g, "1/4")
        .replace(/¾/g, "3/4");
}

function getAmount(ingredient) {
    const clean = normalizeFractions(ingredient);
    const match = clean.match(/^[\d\/\.]+/);
    return match ? match[0] : null;
}

function matchesIngredient(recipeIngredient, userIngredient) {
    return recipeIngredient.includes(userIngredient) ||
           userIngredient.includes(recipeIngredient);
}

/**
 * Finds all recipes with users ingredients in users inventory
 * @param {String} username
 * @returns list of recipes that contain ingredient
 */
async function recipesByInventory(username) {
    const userInventory = await getCurrentInventory(username);
    const db = await Connection.open(mongoUri, 'serve');
    const recipes = await db.collection(RECIPES)
    .find({
        title: { $ne: null },
        cleanedIngredients: { $ne: [''] }
    })
    .limit(100)
    .toArray();
    
    const filteredRecipes = recipes.filter(recipe => {
    const ingredients = (recipe.cleanedIngredients || [])
            .filter(ing => ing && ing.trim() !== ''); 

            if (ingredients.length === 0) return false;

            const matchCount = ingredients.filter(ingredient =>
            userInventory.some(item =>
                matchesIngredient(ingredient.toLowerCase(), item.toLowerCase())
            )
        ).length;

        // user has at least 1/4 of required ingredients
            return (matchCount / ingredients.length) >= 0.25;
    });

    return filteredRecipes;
}

/**
 * For future use -- gets inventory of currently logged in user
 * @returns list of ingredients in inventory
 */
async function getCurrentInventory(username) {
    // find user in db 
    const db = await Connection.open(mongoUri, 'serve');
    const user = await db.collection(USERS).findOne({username: username});
    const userInventory = user.inventory;
    // add ingredients in users db to list for output
    let userIngredients = [];
    userIngredients = userInventory.map((x) => x.itemName);
    return user ? userIngredients : []; // return empty list if inventory is empty
}

/**
 * Middleware for Express endpoints to require user to be logged in
 * @param req request object
 * @param res response object
 * @param next next action to perform
 */
function requiresLogin(req, res, next) {
    if (!req.session.loggedIn) {
        req.flash('error', 'this page requires you to be logged in.');
        return res.redirect("/");
    } else { next(); }
};

function isVegan(recipe) {
    const nonVegan = [
        "chicken", "beef", "pork", "fish", "shrimp",
        "ham", "bacon", "sausage", "lamb", "turkey",
        "milk", "butter", "cheese", "egg", "yogurt", "honey",
        "cream", "ghee", "mayo", "mayonnaise", "anchovy", "snapper", 
        "fish", "salmon", "ribs", "spam",
    ];

    return !recipe.cleanedIngredients.some(ingredient =>
        nonVegan.some(bad => ingredient.toLowerCase().includes(bad))
    );
}

function isVegetarian(recipe) {
    const nonVegetarian = [
        "chicken", "beef", "pork", "fish", "shrimp",
        "ham", "bacon", "sausage", "lamb", "turkey",
        "anchovy", "chorizo", "snapper", 
        "fish", "salmon", "ribs", "spam",
    ];

    return !recipe.cleanedIngredients.some(ingredient =>
        nonVegetarian.some(bad => ingredient.toLowerCase().includes(bad))
    );
}

function isGlutenFree(recipe) {
    const gluten = [
        "flour", "wheat", "bread", "pasta", "noodle", "barley"
    ];

    return !recipe.cleanedIngredients.some(ingredient =>
        gluten.some(bad => ingredient.toLowerCase().includes(bad))
    );
}

function isHalal(recipe) {
    const nonHalal = [
        "pork", "bacon", "ham", "sausage",
        "wine", "beer", "bourbon", "rum", "vodka", "whiskey", "alcohol",
        "lard"
    ];

    return !recipe.cleanedIngredients.some(ingredient =>
        nonHalal.some(bad =>
            ingredient.toLowerCase().includes(bad)
        )
    );
}

// ==========================================================================

// main page. just has links to two other pages
app.get('/', (req, res) => {
    let loggedIn;
    if (!req.session.loggedIn) { loggedIn = false } else { loggedIn = true };

    return res.render('index.ejs', { loggedIn: loggedIn });
});

// ==========================================================================

// recipe pages
app.get('/recipes/', requiresLogin, async (req, res) => {
    try { 
    const searchInput = req.query.searchInput;
    // const recipes = await getAllRecipes();
    const username = req.session.username;
    const filters = req.query.filters;
    let selectedFilters = [];

    // if user selected any filters
    if (filters) {
        selectedFilters = Array.isArray(filters) ? filters : [filters];
    }

    let filteredRecipes = await recipesByInventory(username);

    // if someone searches something, filter recipe list
    if (searchInput) {
        // grab search input 
        const search = searchInput.toLowerCase();

        filteredRecipes = filteredRecipes.filter(recipe => {
            const title = (recipe.title || '').toLowerCase();

            return recipe.cleanedIngredients.some(ingredient =>
                ingredient.toLowerCase().includes(search)
            ) || title.includes(search);
        });
    }

            if (selectedFilters.includes("vegan")) {
            filteredRecipes = filteredRecipes.filter(isVegan);
        }

        if (selectedFilters.includes("vegetarian")) {
            filteredRecipes = filteredRecipes.filter(isVegetarian);
        }

        if (selectedFilters.includes("glutenFree")) {
            filteredRecipes = filteredRecipes.filter(isGlutenFree);
        }

        if (selectedFilters.includes("halal")) {
            filteredRecipes = filteredRecipes.filter(isHalal);
        }

    // grab users username to retrieve saved recipes and pass to recipes page
    // this will render red / grey hearts 
    const db = await Connection.open(mongoUri, 'serve');
    const user = await db.collection(USERS).findOne({ username: username });

    // console.log('filteredRecipes', filteredRecipes[0]);
    return res.render('recipes.ejs', { recipes: filteredRecipes,
        savedRecipes: user.savedRecipes || []
    });
} catch (err) {
    console.error("RECIPES PAGE ERROR:", err);
        res.status(500).send(err.message);
}
});

// for search
app.get('/saved', requiresLogin, async (req, res) => {
    // find that users saved recipes
    const db = await Connection.open(mongoUri, 'serve');
    const user = await db.collection(USERS).findOne({username: req.session.username});
    const savedRecipes = await db.collection('recipes').find({
    recipeID: { $in: user.savedRecipes }
    }).toArray();
    
    // consider case user has no saved recipes
    return res.render('recipes.ejs',{
                        recipes: savedRecipes,
                        savedRecipes: savedRecipes || []
                    }
    )
});

// user saves or unsaves recipes 
app.post('/save-recipe', requiresLogin, async (req, res) => {
    const recipeID = parseInt(req.body.recipeID);
    const db = await Connection.open(mongoUri, 'serve');
    const user = await db.collection(USERS).findOne({ username: req.session.username });
    
    // if user unsaving 
    if (user.savedRecipes.includes(recipeID)) {
        await db.collection('users').updateOne(
            { username: req.session.username },
            { $pull: { savedRecipes: recipeID } }
        );
    } else { // if user saving
        await db.collection('users').updateOne(
            { username: req.session.username },
            { $addToSet: { savedRecipes: recipeID } }
        );
    }

    res.redirect('back'); // might also make an ajax version for alpha
});

// loads a specific recipe after being clicked on
app.get('/recipes/:recipeID', async (req, res) => {
    const recipeID = req.params.recipeID;
    const db = await Connection.open(mongoUri, 'serve');
    const recipe = await db.collection(RECIPES).findOne({recipeID: parseInt(recipeID)});

    //render flashes later
    if (recipe === null) {
        req.flash('error', "There is no recipe with that recipe ID!");
    }


    return res.render('recipeSpecific.ejs',
                        {recipeID,
                            recipe
                        });
});

// ==========================================================================

// inventory pages
const storageLocations = ['fridge', 'freezer', 'pantry'];

// renders inventory page with user's ingredients
app.get('/inventory/:location', requiresLogin, async (req, res) => {
    // get storage location (not functional yet)
    const location = req.params.location;
    const user = req.session.username; 

    // access user database & get user's inventory items
    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection(USERS);
    let userDoc = await users.findOne({username: user});
    let inventory = userDoc?.inventory ?? [];
    let expiringItems = [];

    // expiration date notifications
    if (inventory != []) {
        inventory.forEach(item => {
            if (!item.expiration) return;

            let currDate = new Date();
            let expirDate = new Date(item.expiration);
            let dayDiff = expirDate.getDate() - currDate.getDate() + 1;

            // if current date is 3 days or less away from expiration date
            let dateCompare = expirDate.getFullYear() === currDate.getFullYear() &&
                 expirDate.getMonth() === currDate.getMonth() && dayDiff <= 3 && dayDiff >= 0;
            
            // flash expiration notifications
            if (dayDiff < 0) {
                expiringItems.push(`${item.itemName} is expired`);
            } else if (dayDiff <= 3) {
                expiringItems.push(`${item.itemName} expires in ${dayDiff} day(s)`);
            }
        });
    }
    return res.render('inventory.ejs', {locations: storageLocations, ingredients: inventory, expiringItems: expiringItems});
});

// inserts an ingredient into the fridge
app.post('/add-item', requiresLogin, async (req, res) => {
    
    // get item info from form
    const itemName = req.body.itemName;
    const imgFile = itemName[0].toUpperCase() + itemName.slice(1) + '.png';

    const expiration = req.body.expiration;
    const amount = req.body.amount;

    // access database
    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection(USERS);

    let ingredients = await users.updateOne(
                { username: req.session.username },
                { $addToSet: { inventory: { itemName: itemName,  
                                            imgFile: imgFile,
                                            expiration: expiration, 
                                            amount: amount} } },
                { upsert: true });

    return res.redirect('/inventory/fridge');
});

// deletes an item from the fridge
app.post('/delete-item/:itemId', requiresLogin, async (req, res) => {
    // get specific item to delete from shelf
    const itemId = req.params.itemId;

    // access database
    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection(USERS);

    // pull specified item out of user inventory
    let result = await users.updateOne(
                { username: req.session.username },
                { $pull: { inventory: { itemName: itemId } } });

    return res.redirect('/inventory/fridge');
});


// not functional yet, but will be for increasing/decreasing amounts of items (using Ajax?)
app.post('/increment-item', requiresLogin, async (req, res) => {
    
    // get item info from form
    const itemName = req.body.itemName;
    const expiration = req.body.expiration;
    const incNumber = req.body.removeNumber;

    // access database
    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection(USERS);

    let ingredients = await users.updateOne(
                { username: req.session.username },
                { $inc: { inventory: { amount: incNumber } } });

    return res.redirect('/inventory/fridge');
});


// ==========================================================================

// profile page
app.get('/profile', requiresLogin, (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    return res.render('profile.ejs', { username: req.session.username});
});

// renders log in/register page
app.get('/login', async (req, res) => { 
    return res.render('login.ejs');
});

app.get('/signup', async (req, res) => { 
    return res.render('signup.ejs');
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
            req.flash('error', "Login already exists. Please try logging in instead.");
            return res.redirect('/login');
        }

        // otherwise insert a new user with empty inventory and savedrecipes
        await db.collection(USERS).insertOne({
            username: username,
            hash: hash,
            inventory: [],
            savedRecipes: [],
        });

        // on successful registration, create session with given username
        req.flash('info', 'Successfully joined and logged in as ' + username);
        req.session.username = username;
        req.session.loggedIn = true;
        
        return res.redirect('/inventory/fridge');
    
    } catch (error) {
        req.flash('error', `Form submission error: ${error}`);
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
            req.flash('error', "Username does not exist.");
            return res.redirect('/')
        }
        const match = await bcrypt.compare(password, existingUser.hash); 
        
        if (!match) {
            req.flash('error', "Username or password incorrect.");
            return res.redirect('/login')
        }
        req.flash('info', 'Successfully logged in as ' + username);
        req.session.username = username;
        req.session.loggedIn = true;

        return res.redirect('/inventory/fridge');
    
    } catch (error) {
        req.flash('error', `Form submission error: ${error}`);
        return res.redirect('/');
    }
});

// log out if currently logged in, flashes error otherwise
app.post('/logout', (req, res) => {
    if (req.session.username) {
        req.session.username = null;
        req.session.loggedIn = false;
        req.flash('info', 'You are logged out.');
        return res.redirect('/');
    } else {
        req.flash('error', 'You are not logged in.');
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
