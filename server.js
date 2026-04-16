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
app.use('/data', express.static('data'));
app.set('view engine', 'ejs');

const mongoUri = cs304.getMongoUri();

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
// --------------------------------------------------------------------------------

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


// // for search
app.get('/recipes/:ingredients', async (req, res) => {
    const ingredient = req.params.ingredients;
    const result = recipesByIngredient(ingredient);

    return res.render('recipes.ejs',
                        {recipe: result});
});

// inventory pages
const storageLocations = ['fridge', 'freezer', 'pantry'];
const testIngredients = [{name: "apple", imgFile: "Apple.png", expiration: "04-22-26", type: "fruit", amount: 2},
                         {name: "peach", imgFile: "Peach.png", expiration: "04-12-26", type: "fruit", amount: 5},
                         {name: "eggs", imgFile: "Eggs.png", expiration: "04-30-26", type: "poultry", amount: 12}
                        ];

app.get('/inventory', (req, res) => {
    return res.render('inventory.ejs', {locations: storageLocations, ingredients: testIngredients});
});

// app.post('/recipes/:search', async (req, res) => {
//     const searchInput = req.params.search;

//     const searchresults = recipesByIngredient(searchInput);
//     console.log(searchresults);
    
//     return res.render('recipes.ejs');
// });

const serverPort = cs304.getPort(8080);

// --------------------------------------------------------------------------------

// this is last, because it never returns
app.listen(serverPort, function() {
    console.log(`listening on ${serverPort}`);
    console.log(`visit http://cs.wellesley.edu:${serverPort}/`);
    console.log(`or http://localhost:${serverPort}/`);
    console.log('^C to exit');
});
