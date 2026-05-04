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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Morgan reports the final status code of a request's response
app.use(morgan('tiny'));
app.use(cs304.logStartRequest);

// This handles POST data
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// file upload with multer
const multer = require("multer");
const { count } = require('console');
app.use('/uploads', express.static('uploads'));

app.use(cs304.logRequestData);  // tell the user about any request data

app.use(flash()); // flashing
app.use(serveStatic('public'));
app.use('/data', express.static('data'));
app.set('view engine', 'ejs');

const mongoUri = cs304.getMongoUri();

// for database access without typos
const USERS = 'users';
const RECIPES = 'recipes';

// took this from passwords example app
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

/**
 * Checks if two ingredient strings roughly match.
 * Uses substring matching in both directions to allow flexibility
 * (e.g., "chicken breast" matches "chicken").
 * @param {string} recipeIngredient
 * @param {string} userIngredient
 * @returns {boolean}
 */
function matchesIngredient(recipeIngredient, userIngredient) {
    return recipeIngredient.includes(userIngredient) ||
           userIngredient.includes(recipeIngredient);
}

/**
 * Returns recipes that partially match a user's inventory.
 * A recipe is included if at least 25% of its ingredients
 * appear in the user's inventory.
 *
 * @param {string} username
 * @returns {Array<Object>} filtered recipes
 */
async function recipesByInventory(userInv) {
    const userInventory = userInv.map(item => item.itemName);
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

            // count how many recipe ingredients appear in user inventory
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
 * Retrieves the list of ingredient names in a user's inventory.
 * @param {string} username
 * @returns {Array<string>} list of ingredient names
 */
async function getCurrentInventory(username) {
    // find user in db 
    const db = await Connection.open(mongoUri, 'serve');
    const user = await db.collection(USERS).findOne({username: username});
    const userInventory = user.inventory;
    
    // add ingredients in users db to list for output
    let userIngredients = [];
    if (!user || !user.inventory) return []; // if user or inventory don't exist, return empty list
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
    } else { next() };
};


/**
 * Checks if recipe is vegan
 * @param recipe recipe document
 */
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

/**
 * Checks if recipe is vegetarian
 * @param recipe recipe document
 */
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

/**
 * Checks if recipe is gluten free
 * @param recipe recipe document
 */
function isGlutenFree(recipe) {
    const gluten = [
        "flour", "wheat", "bread", "pasta", "noodle", "barley"
    ];

    return !recipe.cleanedIngredients.some(ingredient =>
        gluten.some(bad => ingredient.toLowerCase().includes(bad))
    );
}

/**
 * Checks if recipe is halal
 * @param recipe recipe document
 */
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

/**
 * GET /recipes
 * Displays recipe cards filtered by:
 * - user inventory (base filter)
 * - search query (title + ingredients)
 * - dietary filters (vegan, vegetarian, etc.)
 *
 * Also passes user's saved recipe IDs to render heart states.
 */
app.get('/recipes/', requiresLogin, async (req, res) => {
    const searchInput = req.query.searchInput;
    const username = req.session.username;
    const filters = req.query.filters;
    let selectedFilters = [];

    const db = await Connection.open(mongoUri, 'serve');

    const user = await db.collection(USERS).findOne({
        username: username
    });

    let filteredRecipes = await getAllRecipes();
    filteredRecipes = filteredRecipes.sort(() => Math.random() - 0.5);

    // if user selected any filters
    if (filters) {
        selectedFilters = Array.isArray(filters) ? filters : [filters];
    }

    // if someone searches something, filter recipe list
    if (searchInput) {
        // grab search input 
        const search = searchInput.toLowerCase();

        filteredRecipes = filteredRecipes.filter(recipe => {
            const title = (recipe.title || '').toLowerCase();

            const ingredients = recipe.cleanedIngredients || [];

            return ingredients.some(ingredient =>
                ingredient.toLowerCase().includes(search)
            ) || title.includes(search);
        });
    }

        if (selectedFilters.includes("currInventory")) {
            filteredRecipes = await recipesByInventory(user.inventory || []);
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

    return res.render('recipes.ejs', { recipes: filteredRecipes,
        savedRecipes: user.savedRecipes || []
    });
});

/**
 * GET /saved
 * Displays only recipes the user has saved.
 * Also passes saved recipe IDs for heart rendering.
 */
app.get('/saved', requiresLogin, async (req, res) => {
    // find that users saved recipes
    const db = await Connection.open(mongoUri, 'serve');
    const user = await db.collection(USERS).findOne({
        username: req.session.username
    });
    const savedRecipeIDs = user.savedRecipes || [];
    const savedRecipes = await db.collection('recipes').find({
        recipeID: { $in: savedRecipeIDs }
    }).toArray();

    return res.render('recipes.ejs', {
        recipes: savedRecipes,          
        savedRecipes: savedRecipeIDs    
    });
});

/**
 * GET /created
 * Displays a specific user's created recipes
 * Passes saved recipe IDs for heart rendering.
 */
app.get('/created', requiresLogin, async (req, res) => {
    // find that users created recipes
    const db = await Connection.open(mongoUri, 'serve');
    const user = await db.collection(USERS).findOne({ username: req.session.username });
    const savedRecipeIDs = user.savedRecipes || [];
    const createdRecipes = await db.collection('recipes')
                                   .find({ recipeID: { $in: user.createdRecipes }})
                                   .toArray();
    
    // consider case user has no created recipes
    return res.render('recipes.ejs',{
                        recipes: createdRecipes,
                        savedRecipes: savedRecipeIDs  // needed for heart rendering
                    })
});

/**
 * POST /save-recipe/:recipeID
 * Toggles a recipe in the user's savedRecipes list.
 * - If already saved → remove
 * - If not saved → add
 */
app.post('/save-recipe/:recipeID', requiresLogin, async (req, res) => {

    const recipeID = Number(req.params.recipeID);

    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection('users');

    const user = await users.findOne({
        username: req.session.username
    });

    const alreadySaved =
        (user.savedRecipes || []).includes(recipeID);

    if (alreadySaved) {

        await users.updateOne(
            { username: req.session.username },
            { $pull: { savedRecipes: recipeID } }
        );

        return res.json({
            error: false,
            saved: false
        });

    } else {

        await users.updateOne(
            { username: req.session.username },
            { $addToSet: { savedRecipes: recipeID } }
        );

        return res.json({
            error: false,
            saved: true
        });
    }
});

// loads a specific recipe after being clicked on
app.get('/recipes/:recipeID', async (req, res) => {
    const recipeID = req.params.recipeID;
    const db = await Connection.open(mongoUri, 'serve');
    const recipe = await db.collection(RECIPES).findOne({recipeID: parseInt(recipeID)});

    // render flashes later
    if (recipe === null) {
        req.flash('error', "There is no recipe with that recipe ID!");
    }

    return res.render('recipeSpecific.ejs',
                        {recipeID,
                            recipe });
});

// ==========================================================================

// create recipe/upload image file endpoints
const UPLOADS = 'uploads';

/**
 * Returns a string like 123456 for 56 seconds past 12:34. 
 * If the argument is omitted, the current time is used.
 * Function from File Upload reading
 * @param {Date} dateObj optional date object
 * @returns a String showing the time, i.e. '123456'
 */
function timeString(dateObj) {
    if( !dateObj) {
        dateObj = new Date(); 
    }
    // convert val to two-digit string
    d2 = (val) => val < 10 ? '0'+val : ''+val;
    let hh = d2(dateObj.getHours())
    let mm = d2(dateObj.getMinutes())
    let ss = d2(dateObj.getSeconds())
    return hh+mm+ss
}

/**
 * Checks if viewerId is the same as ownerId
 * @param {String} viewerId 
 * @param {String} ownerId 
 * @returns true if viewerId is the same as ownerId
 */
function isAuthorizedToView(viewerId, ownerId) {
    console.log('auth?', viewerId, ownerId);
    return viewerId === ownerId;
}

// set image storage to disk
let storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS)
  },
  filename: function (req, file, cb) {
      let parts = file.originalname.split('.');
      let ext = parts[parts.length-1];
      let hhmmss = timeString();
      cb(null, file.fieldname + '-' + hhmmss + '.' + ext);
  }
});

// set up file size limit and assign storage
let upload = multer({ storage: storage,
                      // file size in bytes
                      limits: {fileSize: 1_000_000 }});

// starting number for recipeIDs
let COUNTER = 13500; // DON'T TOUCH THIS LOL

/**
 * POST /add-recipe
 * form takes recipe name, image file, ingredients list, and instructions
 * adds recipe to user's createdRecipes list with a unique ID number
 */
app.post('/add-recipe', requiresLogin, upload.single('image'), async (req, res) => {
    const username = req.session.username;
    
    // log info
    console.log('file', req.file);
    console.log('uploaded data', req.body);
    
    // get recipe info from form
    const recipeName = req.body.recipeName;
    let imgFilePath = req.file.path;
    const ingredients = req.body.ingredients.split(',').map(s => s.trim()); // split on commas
    const instructions = req.body.instructions;

    // access database
    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection(USERS);
    const recipes = db.collection(RECIPES);

    const result = await db.collection(UPLOADS)
          .insertOne({title: recipeName.split(' ').join(''),
                      owner: username,
                      path: '/uploads/'+req.file.filename});
    console.log('insertOne result', result);

    // ID for new recipe is the number of documents in recipes collection +1
    let recipeID = await db.collection(RECIPES).countDocuments();
    recipeID++;
    console.log(recipeID);

    // upsert recipe into recipe collection
    let recipe = await recipes.insertOne( { cleanedIngredients: ingredients,
                                            imageName: imgFilePath,
                                            ingredients: ingredients,
                                            instructions: instructions, 
                                            recipeID: recipeID,
                                            title: recipeName } );
    
    // add recipeID into user's createdRecipes list
    let userUpdate = await users.updateOne( 
                                    { username: username },
                                    { $addToSet: { createdRecipes: recipeID } });

    // confirmation message + redirect to the new recipe page
    req.flash('info', 'Recipe added!');
    return res.redirect(`/recipes/${recipeID}`);
});

// ==========================================================================

// inventory pages
const storageLocations = ['fridge', 'freezer', 'pantry'];

/**
 * GET /inventory/:location
 * gets user's inventory per storage location
 * renders items in that storage location, calculates expiration date notifications
 */
app.get('/inventory/:location', requiresLogin, async (req, res) => {
    // get storage location
    const location = req.params.location;
    const user = req.session.username; 

    // access user database & get user's inventory items
    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection(USERS);
    let userDoc = await users.findOne({username: user});
    let inventory = userDoc?.inventory ?? [];
    let expiringItems = [];

    // list out items in the specified storage location
    let specificInv = [];
    if ( inventory.length > 0 ) {
        inventory.forEach(item => {
            if ( item.location === location ) { specificInv.push(item); }
    })};

    // expiration date notifications
    if (specificInv.length > 0) {
        specificInv.forEach(item => {
            if (!item.expiration) return;

            let currDate = new Date();
            let expirDate = new Date(item.expiration);
            let dayDiff = (expirDate.getTime() - currDate.getTime()) / 86400000;
            
            // flash expiration notifications
            if (dayDiff < 0) {
                expiringItems.push(`${item.itemName} is expired`);
            } else if (dayDiff <= 3) {
                expiringItems.push(`${item.itemName} expires in ${Math.round(dayDiff)} day(s)`);
            }
        });
    }
    return res.render('inventory.ejs', {locations: storageLocations, 
                                        location: location, 
                                        ingredients: specificInv, 
                                        expiringItems: expiringItems});
});

/**
 * POST /add-item
 * inserts an ingredient (with the given form info) into user's inventory
 * redirects to fridge
 */
app.post('/add-item', requiresLogin, async (req, res) => {
    
    // get item info from form
    const itemName = req.body.itemName;
    const imgFile = itemName[0].toUpperCase() + itemName.slice(1) + '.png';
    const location = req.body.chosenLocation;
    const expiration = req.body.expiration;

    // access database
    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection(USERS);

    let ingredients = await users.updateOne(
                { username: req.session.username },
                { $addToSet: { inventory: { itemName: itemName,  
                                            imgFile: imgFile,
                                            location: location,
                                            expiration: expiration } } },
                { upsert: true });

    return res.redirect('/inventory/fridge');
});

/**
 * POST /delete-item
 * deletes the specified item from the fridge using itemId and currLocation
 * redirects to the deleted item's location
 */
app.post('/delete-item', requiresLogin, async (req, res) => {
    // get specific item to delete from shelf
    const itemId = req.body.itemId;
    const currLocation = req.body.location;
    const username = req.session.username;

    // access database
    const db = await Connection.open(mongoUri, 'serve');
    const users = db.collection(USERS);

    // if there are items in the inventory, get the current location for precise redirect
    let userDoc = await users.findOne({username: username});
    let userInv = userDoc.inventory || [];

    // pull specified item out of user inventory
    let result = await users.updateOne(
                { username: username },
                { $pull: { inventory: { itemName: itemId, location: currLocation } } } );

    // redirect to specified location (fridge is default if none given)
    return res.redirect(`/inventory/${currLocation}`);
});

// ==========================================================================

// profile page
app.get('/profile', requiresLogin, (req, res) => {
    if (!req.session.username) {
        req.flash('error', 'You are not logged in - please do so.');
        return res.redirect("/");
    }
    return res.render('profile.ejs', { username: req.session.username });
});

// log in page
app.get('/login', async (req, res) => { 
    return res.render('login.ejs');
});

// sign up page
app.get('/signup', async (req, res) => { 
    return res.render('signup.ejs');
});

/**
 * POST /signup
 * creates user with submitted username/password 
 * inserts into users collection
 */
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
            createdRecipes: []
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

/**
 * POST /login
 * checks username and password match, then logs user in
 */
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

/**
 * POST /logout
 * log out if currently logged in, flashes error otherwise
 */
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

// postlude

// for file upload error handling (from File Upload reading)
app.use((err, req, res, next) => {
    console.log('error', err);
    if(err.code === 'LIMIT_FILE_SIZE') {
        console.log('file too big')
        req.flash('error', 'file too big')
        res.redirect('/')
    } else {
        console.error(err.stack)
        res.status(500).send('Something broke!')
    }
})

const serverPort = cs304.getPort(8080);

// this is last, because it never returns
app.listen(serverPort, function() {
    console.log(`listening on ${serverPort}`);
    console.log(`visit http://cs.wellesley.edu:${serverPort}/`);
    console.log(`or http://localhost:${serverPort}/`);
    console.log('^C to exit');
});